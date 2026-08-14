/**
 * ClassesService
 * Turmas e as disciplinas que elas cursam.
 *
 * A turma é o GRUPO DE ALUNOS de um curso. Cada disciplina que ela cursa vira
 * um ClassSubject com professor próprio e carga própria — a mesma Matemática
 * pode ter professores diferentes no 3ºA e no 3ºB, e a frequência do aluno é
 * contada por disciplina.
 *
 * A criação é em duas etapas no painel (dados da turma → disciplinas), mas
 * chega aqui num payload só e é gravada numa transação: turma sem disciplina
 * nenhuma não serve para nada.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors";
import { lessonDurationToMinutes } from "./subjects.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface ClassSubjectInput {
  subjectId: string;
  teacherId: string;
  /** Aulas seguidas que uma chamada desta disciplina ocupa. */
  lessonsPerSession?: number;
  /** Aulas previstas no período — denominador da frequência. */
  totalLessonsPlanned?: number;
}

export interface CreateClassInput {
  tenantId: string;
  courseId: string;
  name: string;
  room?: string;
  locationId?: string;
  /** Pelo menos uma disciplina. */
  subjects: ClassSubjectInput[];
}

export interface UpdateClassInput {
  name?: string;
  room?: string;
  locationId?: string;
  /** Quando presente, substitui a grade inteira da turma. */
  subjects?: ClassSubjectInput[];
}

export interface ClassSubjectOutput {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  teacherId: string;
  teacherName: string;
  lessonsPerSession: number;
  totalLessonsPlanned: number;
  /** Duração de uma chamada desta disciplina, em minutos. */
  sessionDurationMin: number;
}

export interface ClassOutput {
  id: string;
  tenantId: string;
  courseId: string;
  courseName?: string;
  name: string;
  room?: string;
  locationId?: string;
  locationName?: string;
  /** Grade do curso — a turma só exibe. */
  lessonDurationMin: number;
  lessonsPerDay: number;
  subjects: ClassSubjectOutput[];
  /** Soma das aulas por chamada de todas as disciplinas. */
  lessonsAssigned: number;
  enrolledCount: number;
  createdAt: Date;
}

export interface ListClassesParams extends ListParams {
  tenantId: string;
  courseId?: string;
  subjectId?: string;
  /** Professor vê apenas turmas em que leciona alguma disciplina. */
  teacherId?: string;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

const TEACHER_ROLES = new Set(["teacher", "admin", "manager"]);

class ClassesService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "courseId"] as const;

  private static readonly INCLUDE = {
    course: {
      select: {
        name: true,
        lessonsPerDay: true,
        lessonDuration: true,
        lessonDurationUnit: true,
      },
    },
    location: { select: { name: true } },
    classSubjects: {
      include: {
        subject: { select: { name: true, code: true } },
        teacher: { select: { name: true } },
      },
      orderBy: { subject: { name: "asc" } },
    },
    _count: { select: { enrollments: true } },
  } as const;

  /**
   * Lista turmas do tenant.
   */
  async list(params: ListClassesParams): Promise<PaginatedResult<ClassOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, ClassesService.SORT_FIELDS) ??
      { createdAt: "desc" as const };
    const searchOr = this.buildSearchFilter(params.search, ["name", "room"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.courseId && { courseId: params.courseId }),
      // Filtros por disciplina/professor atravessam o vínculo
      ...((params.subjectId || params.teacherId) && {
        classSubjects: {
          some: {
            ...(params.subjectId && { subjectId: params.subjectId }),
            ...(params.teacherId && { teacherId: params.teacherId }),
          },
        },
      }),
      ...(searchOr && { OR: searchOr }),
    };

    const [classes, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        take,
        skip,
        orderBy,
        include: ClassesService.INCLUDE,
      }),
      this.prisma.class.count({ where }),
    ]);

    return this.buildPaginatedResult(
      classes.map((c) => this.toOutput(c)),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém uma turma pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<ClassOutput> {
    const classItem = await this.prisma.class.findFirst({
      where: { id, tenantId },
      include: ClassesService.INCLUDE,
    });
    if (!classItem) throw new NotFoundError("Class not found");
    return this.toOutput(classItem);
  }

  /**
   * Cria a turma com a grade de disciplinas numa transação.
   */
  async create(input: CreateClassInput): Promise<ClassOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!course) throw new NotFoundError("Course not found in this tenant");

    if (input.locationId) {
      await this.assertLocation(input.locationId, input.tenantId);
    }

    const rows = await this.validateSubjects(
      input.subjects,
      input.courseId,
      input.tenantId
    );

    const created = await this.prisma.class.create({
      data: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        name: input.name,
        room: input.room,
        locationId: input.locationId,
        classSubjects: {
          create: rows.map((r) => ({
            tenantId: input.tenantId,
            subjectId: r.subjectId,
            teacherId: r.teacherId,
            lessonsPerSession: r.lessonsPerSession,
            totalLessonsPlanned: r.totalLessonsPlanned,
          })),
        },
      },
      include: ClassesService.INCLUDE,
    });

    this.logger.info(
      { classId: created.id, tenantId: input.tenantId, subjects: rows.length },
      "Class created"
    );
    return this.toOutput(created);
  }

  /**
   * Atualiza a turma. Passar `subjects` substitui a grade inteira.
   *
   * Remover uma disciplina que já tem chamada registrada é bloqueado: as
   * sessões e a frequência acumulada penduram nela.
   */
  async update(id: string, tenantId: string, input: UpdateClassInput): Promise<ClassOutput> {
    const classItem = await this.prisma.class.findFirst({
      where: { id, tenantId },
      select: { id: true, courseId: true },
    });
    if (!classItem) throw new NotFoundError("Class not found");

    if (input.locationId !== undefined && input.locationId !== null) {
      await this.assertLocation(input.locationId, tenantId);
    }

    let rows: Required<ClassSubjectInput>[] | undefined;
    if (input.subjects) {
      rows = await this.validateSubjects(input.subjects, classItem.courseId, tenantId);

      const keptSubjectIds = new Set(rows.map((r) => r.subjectId));
      const existing = await this.prisma.classSubject.findMany({
        where: { classId: id },
        select: {
          id: true,
          subjectId: true,
          subject: { select: { name: true } },
          _count: { select: { classSessions: true } },
        },
      });

      const withHistory = existing.filter(
        (cs) => !keptSubjectIds.has(cs.subjectId) && cs._count.classSessions > 0
      );
      if (withHistory.length > 0) {
        throw new ValidationError(
          `Estas disciplinas já têm chamadas registradas e não podem sair da turma: ${withHistory
            .map((cs) => cs.subject.name)
            .join(", ")}`,
          "CLASS_SUBJECT_HAS_SESSIONS"
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (rows) {
        const keptSubjectIds = rows.map((r) => r.subjectId);
        // Remove só as que saíram — apagar tudo e recriar perderia os ids
        // e, com eles, a frequência acumulada das que continuam
        await tx.classSubject.deleteMany({
          where: { classId: id, subjectId: { notIn: keptSubjectIds } },
        });
        for (const row of rows) {
          await tx.classSubject.upsert({
            where: { classId_subjectId: { classId: id, subjectId: row.subjectId } },
            create: {
              tenantId,
              classId: id,
              subjectId: row.subjectId,
              teacherId: row.teacherId,
              lessonsPerSession: row.lessonsPerSession,
              totalLessonsPlanned: row.totalLessonsPlanned,
            },
            update: {
              teacherId: row.teacherId,
              lessonsPerSession: row.lessonsPerSession,
              totalLessonsPlanned: row.totalLessonsPlanned,
            },
          });
        }
      }

      return tx.class.update({
        where: { id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.room !== undefined && { room: input.room }),
          ...(input.locationId !== undefined && { locationId: input.locationId }),
        },
        include: ClassesService.INCLUDE,
      });
    });

    this.logger.info({ classId: id, tenantId }, "Class updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta uma turma. Bloqueado se qualquer disciplina já tiver chamada.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const classItem = await this.prisma.class.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!classItem) throw new NotFoundError("Class not found");

    const sessions = await this.prisma.classSession.count({
      where: { classSubject: { classId: id } },
    });
    if (sessions > 0) {
      throw new ValidationError(
        `Esta turma tem ${sessions} chamada(s) registrada(s). O histórico de presença seria perdido.`,
        "CLASS_HAS_SESSIONS"
      );
    }

    await this.prisma.class.delete({ where: { id } });
    this.logger.info({ classId: id, tenantId }, "Class deleted");
  }

  /** O professor leciona alguma disciplina desta turma? */
  async isTeacherOfClass(classId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.classSubject.findFirst({
      where: { classId, teacherId: userId },
      select: { id: true },
    });
    return found !== null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async assertLocation(locationId: string, tenantId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { id: true },
    });
    if (!location) throw new NotFoundError("Location not found in this tenant");
  }

  /**
   * Valida a grade: disciplinas do curso certo, sem repetição, professores
   * que existem e podem lecionar.
   */
  private async validateSubjects(
    subjects: ClassSubjectInput[],
    courseId: string,
    tenantId: string
  ): Promise<Required<ClassSubjectInput>[]> {
    if (subjects.length === 0) {
      throw new ValidationError(
        "A turma precisa de pelo menos uma disciplina",
        "CLASS_NO_SUBJECTS"
      );
    }

    const subjectIds = subjects.map((s) => s.subjectId);
    if (new Set(subjectIds).size !== subjectIds.length) {
      throw new ConflictError("A mesma disciplina foi informada mais de uma vez");
    }

    const found = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, tenantId },
      select: { id: true, name: true, courseId: true, isActive: true },
    });
    if (found.length !== subjectIds.length) {
      throw new NotFoundError("Uma ou mais disciplinas não foram encontradas");
    }

    // Disciplina de outro curso na grade tornaria a turma incoerente
    const foreign = found.filter((s) => s.courseId !== courseId);
    if (foreign.length > 0) {
      throw new ValidationError(
        `Estas disciplinas não pertencem ao curso da turma: ${foreign.map((s) => s.name).join(", ")}`,
        "SUBJECT_WRONG_COURSE"
      );
    }
    const inactive = found.filter((s) => !s.isActive);
    if (inactive.length > 0) {
      throw new ValidationError(
        `Estas disciplinas estão inativas: ${inactive.map((s) => s.name).join(", ")}`,
        "SUBJECT_INACTIVE"
      );
    }

    const teacherIds = [...new Set(subjects.map((s) => s.teacherId))];
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds }, tenantId },
      select: { id: true, name: true, role: true },
    });
    if (teachers.length !== teacherIds.length) {
      throw new NotFoundError("Um ou mais professores não foram encontrados");
    }
    const notTeachers = teachers.filter((t) => !TEACHER_ROLES.has(t.role));
    if (notTeachers.length > 0) {
      throw new ValidationError(
        `Estes usuários não podem lecionar: ${notTeachers.map((t) => t.name).join(", ")}`,
        "NOT_A_TEACHER"
      );
    }

    return subjects.map((s) => ({
      subjectId: s.subjectId,
      teacherId: s.teacherId,
      lessonsPerSession: s.lessonsPerSession ?? 1,
      totalLessonsPlanned: s.totalLessonsPlanned ?? 0,
    }));
  }

  private toOutput(classItem: any): ClassOutput {
    const lessonDurationMin = lessonDurationToMinutes(
      classItem.course?.lessonDuration ?? 50,
      classItem.course?.lessonDurationUnit ?? "minutes"
    );
    const subjects: ClassSubjectOutput[] = (classItem.classSubjects ?? []).map((cs: any) => ({
      id: cs.id,
      subjectId: cs.subjectId,
      subjectName: cs.subject.name,
      subjectCode: cs.subject.code ?? undefined,
      teacherId: cs.teacherId,
      teacherName: cs.teacher.name,
      lessonsPerSession: cs.lessonsPerSession,
      totalLessonsPlanned: cs.totalLessonsPlanned,
      sessionDurationMin: lessonDurationMin * cs.lessonsPerSession,
    }));

    return {
      id: classItem.id,
      tenantId: classItem.tenantId,
      courseId: classItem.courseId,
      courseName: classItem.course?.name,
      name: classItem.name,
      room: classItem.room ?? undefined,
      locationId: classItem.locationId ?? undefined,
      locationName: classItem.location?.name,
      lessonDurationMin,
      lessonsPerDay: classItem.course?.lessonsPerDay ?? 4,
      subjects,
      lessonsAssigned: subjects.reduce((sum, s) => sum + s.lessonsPerSession, 0),
      enrolledCount: classItem._count?.enrollments ?? 0,
      createdAt: classItem.createdAt,
    };
  }
}

export const classesService = new ClassesService();
