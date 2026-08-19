/**
 * CoursesService
 * Gerencia cursos por tenant e período acadêmico.
 *
 * O curso carrega a duração de uma aula (minutos ou horas, escolha da
 * secretaria) — na prática é padrão institucional, então todas as disciplinas
 * do curso herdam esse valor. É a base do fechamento automático da chamada e
 * do cálculo de aulas no checkout individual.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { lessonDurationToMinutes } from "./subjects.service";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";

/** Campos do curso acompanhados pela trilha de auditoria. */
const COURSE_FIELDS = [
  "name",
  "academicPeriodId",
  "lessonsPerDay",
  "lessonDuration",
  "lessonDurationUnit",
] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export type LessonDurationUnit = "minutes" | "hours";

export interface CreateCourseInput {
  tenantId: string;
  academicPeriodId: string;
  name: string;
  /** Quantas aulas cabem num dia letivo do curso. */
  lessonsPerDay?: number;
  lessonDuration?: number;
  lessonDurationUnit?: LessonDurationUnit;
}

export interface UpdateCourseInput {
  name?: string;
  academicPeriodId?: string;
  lessonsPerDay?: number;
  lessonDuration?: number;
  lessonDurationUnit?: LessonDurationUnit;
}

export interface CourseOutput {
  id: string;
  tenantId: string;
  academicPeriodId: string;
  periodName?: string;
  name: string;
  /** Quantas aulas cabem num dia letivo. */
  lessonsPerDay: number;
  /** Duração de uma aula na unidade escolhida pela secretaria. */
  lessonDuration: number;
  lessonDurationUnit: LessonDurationUnit;
  /** Mesmo valor normalizado em minutos — o que o backend usa em cálculos. */
  lessonDurationMin: number;
  subjectCount?: number;
  createdAt: Date;
}

export interface ListCoursesParams extends ListParams {
  tenantId: string;
  academicPeriodId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  /** Já tem alguma turma criada? */
  hasClasses?: boolean;
  /** Já tem alguma disciplina no catálogo? */
  hasSubjects?: boolean;
}

// ── Aplicação da grade do curso nas turmas ───────────────────────────────────

export interface CurriculumSubjectInput {
  subjectId: string;
  /** Professores alocados; o primeiro vira o responsável. */
  teacherIds: string[];
  /** Sem valor, cai no padrão de 1 aula por chamada. */
  lessonsPerSession?: number;
  totalLessonsPlanned?: number;
  /** Sem valor, usa a duração de aula configurada no curso. */
  lessonDurationMin?: number;
}

export interface ApplyCurriculumInput {
  /** Turmas alvo. Vazio/ausente = todas as turmas do curso. */
  classIds?: string[];
  subjects: CurriculumSubjectInput[];
  /**
   * Como tratar a disciplina que a turma JÁ cursa:
   * - "skip": não toca (padrão) — só preenche o que falta
   * - "sync": atualiza a carga
   * - "replace": atualiza a carga e troca o time de professores
   */
  existing?: "skip" | "sync" | "replace";
}

export interface ApplyCurriculumOutput {
  classesAffected: number;
  created: number;
  updated: number;
  skipped: number;
  /** Turmas que ficaram de fora de alguma disciplina e por quê. */
  details: Array<{
    classId: string;
    className: string;
    subjectName: string;
    action: "created" | "updated" | "skipped";
    reason?: string;
  }>;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class CoursesService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "academicPeriodId"] as const;

  /**
   * Lista cursos de um tenant.
   */
  async list(params: ListCoursesParams): Promise<PaginatedResult<CourseOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, CoursesService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.academicPeriodId && { academicPeriodId: params.academicPeriodId }),
      ...(params.hasClasses !== undefined && {
        classes: params.hasClasses ? { some: {} } : { none: {} },
      }),
      ...(params.hasSubjects !== undefined && {
        subjects: params.hasSubjects ? { some: {} } : { none: {} },
      }),
      ...this.buildDateRange("createdAt", params.createdFrom, params.createdTo),
      ...(searchOr && { OR: searchOr }),
    };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        take,
        skip,
        orderBy,
        include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);

    return this.buildPaginatedResult(
      courses.map((c) => this.toOutput(c)),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém um curso pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<CourseOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });
    if (!course) throw new NotFoundError("Course not found");
    return this.toOutput(course);
  }

  /**
   * Cria um novo curso.
   */
  async create(input: CreateCourseInput): Promise<CourseOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Validar que o período acadêmico existe e pertence ao tenant
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: input.academicPeriodId, tenantId: input.tenantId },
    });
    if (!period) throw new NotFoundError("Academic period not found in this tenant");

    const duration = this.validateDuration(input.lessonDuration, input.lessonDurationUnit);

    const course = await this.prisma.course.create({
      data: {
        tenantId: input.tenantId,
        academicPeriodId: input.academicPeriodId,
        name: input.name,
        ...(input.lessonsPerDay !== undefined && { lessonsPerDay: input.lessonsPerDay }),
        lessonDuration: duration.value,
        lessonDurationUnit: duration.unit,
      },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });

    auditService.record({
      action: "course.created",
      tenantId: input.tenantId,
      targetId: course.id,
      targetLabel: course.name,
      afterState: snapshot(course, COURSE_FIELDS),
    });

    this.logger.info({ courseId: course.id, tenantId: input.tenantId }, "Course created");
    return this.toOutput(course);
  }

  /**
   * Duração da aula precisa render um valor operável em minutos: uma aula de
   * 0 min quebraria o cálculo de aulas do checkout, e acima de 8h não é aula.
   */
  private validateDuration(
    value: number | undefined,
    unit: LessonDurationUnit | undefined
  ): { value: number; unit: LessonDurationUnit } {
    const resolvedUnit: LessonDurationUnit = unit ?? "minutes";
    const resolvedValue = value ?? (resolvedUnit === "hours" ? 1 : 50);
    const minutes = lessonDurationToMinutes(resolvedValue, resolvedUnit);

    if (minutes < 5 || minutes > 480) {
      throw new ValidationError(
        "A duração da aula deve ficar entre 5 minutos e 8 horas",
        "INVALID_LESSON_DURATION"
      );
    }
    return { value: resolvedValue, unit: resolvedUnit };
  }

  /**
   * Atualiza um curso.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateCourseInput
  ): Promise<CourseOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
    });
    if (!course) throw new NotFoundError("Course not found");

    // Se academicPeriodId foi alterado, validar que existe e pertence ao tenant
    if (input.academicPeriodId && input.academicPeriodId !== course.academicPeriodId) {
      const period = await this.prisma.academicPeriod.findFirst({
        where: { id: input.academicPeriodId, tenantId },
      });
      if (!period) throw new NotFoundError("Academic period not found in this tenant");
    }

    // Duração é validada como par: mudar só a unidade sem o valor
    // transformaria "50 minutos" em "50 horas"
    const durationChanged =
      input.lessonDuration !== undefined || input.lessonDurationUnit !== undefined;
    const duration = durationChanged
      ? this.validateDuration(
          input.lessonDuration ?? course.lessonDuration,
          input.lessonDurationUnit ?? (course.lessonDurationUnit as LessonDurationUnit)
        )
      : null;

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.academicPeriodId && { academicPeriodId: input.academicPeriodId }),
        ...(input.lessonsPerDay !== undefined && { lessonsPerDay: input.lessonsPerDay }),
        ...(duration && {
          lessonDuration: duration.value,
          lessonDurationUnit: duration.unit,
        }),
      },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });

    auditService.recordChange({
      action: "course.updated",
      tenantId,
      targetId: id,
      targetLabel: updated.name,
      before: course,
      after: updated,
      fields: COURSE_FIELDS,
    });

    this.logger.info({ courseId: id, tenantId }, "Course updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta um curso.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { classes: true } } },
    });
    if (!course) throw new NotFoundError("Course not found");

    // As disciplinas caem em cascata com o curso, mas as turmas seguram a
    // disciplina (RESTRICT) — falharia no banco com erro cru de FK
    if (course._count.classes > 0) {
      throw new ValidationError(
        `Este curso tem ${course._count.classes} turma(s) vinculada(s). Remova as turmas antes de excluir.`,
        "COURSE_HAS_CLASSES"
      );
    }

    await this.prisma.course.delete({ where: { id } });

    // As disciplinas do curso caem em cascata — o contador entra na trilha
    // porque a exclusão apaga mais do que a linha nomeada no evento
    auditService.record({
      action: "course.deleted",
      tenantId,
      targetId: id,
      targetLabel: course.name,
      beforeState: snapshot(course, COURSE_FIELDS),
      details: `Curso "${course.name}" excluído junto com suas disciplinas`,
    });

    this.logger.info({ courseId: id, tenantId }, "Course deleted");
  }

  /**
   * Aplica a grade do curso nas turmas de uma vez.
   *
   * O caso real é a faculdade com 50 turmas do mesmo curso: todas cursam as
   * mesmas disciplinas, muda só quem leciona. Montar a grade turma a turma é
   * o que torna isso inviável hoje.
   *
   * Regra de convivência com o que já existe: por padrão a disciplina que a
   * turma já cursa é preservada (`existing: "skip"`) — a carga e o professor
   * dela podem ter sido ajustados de propósito, e a frequência acumulada
   * pendura no vínculo. "sync" atualiza a carga; "replace" também troca o time.
   */
  async applyCurriculum(
    courseId: string,
    tenantId: string,
    input: ApplyCurriculumInput
  ): Promise<ApplyCurriculumOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true, name: true, lessonDuration: true, lessonDurationUnit: true },
    });
    if (!course) throw new NotFoundError("Course not found");

    const defaultLessonDurationMin = lessonDurationToMinutes(
      course.lessonDuration,
      course.lessonDurationUnit
    );

    if (input.subjects.length === 0) {
      throw new ValidationError(
        "Escolha ao menos uma disciplina para aplicar",
        "CURRICULUM_NO_SUBJECTS"
      );
    }

    // Disciplinas precisam ser do currículo deste curso e estar ativas
    const subjectIds = [...new Set(input.subjects.map((s) => s.subjectId))];
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, tenantId },
      select: {
        id: true,
        name: true,
        courseId: true,
        isActive: true,
      },
    });
    if (subjects.length !== subjectIds.length) {
      throw new NotFoundError("Uma ou mais disciplinas não foram encontradas");
    }
    const foreign = subjects.filter((s) => s.courseId !== courseId);
    if (foreign.length > 0) {
      throw new ValidationError(
        `Estas disciplinas não pertencem ao curso: ${foreign.map((s) => s.name).join(", ")}`,
        "SUBJECT_WRONG_COURSE"
      );
    }
    const inactive = subjects.filter((s) => !s.isActive);
    if (inactive.length > 0) {
      throw new ValidationError(
        `Estas disciplinas estão inativas: ${inactive.map((s) => s.name).join(", ")}`,
        "SUBJECT_INACTIVE"
      );
    }
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    // Professores: existem no tenant e podem lecionar
    const teacherIds = [...new Set(input.subjects.flatMap((s) => s.teacherIds ?? []))];
    if (teacherIds.length === 0) {
      throw new ValidationError(
        "Escolha o professor de cada disciplina",
        "CURRICULUM_NO_TEACHERS"
      );
    }
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds }, tenantId },
      select: { id: true, name: true, role: true },
    });
    if (teachers.length !== teacherIds.length) {
      throw new NotFoundError("Um ou mais professores não foram encontrados");
    }
    const notTeachers = teachers.filter(
      (t) => !["teacher", "admin", "manager"].includes(t.role)
    );
    if (notTeachers.length > 0) {
      throw new ValidationError(
        `Estes usuários não podem lecionar: ${notTeachers.map((t) => t.name).join(", ")}`,
        "NOT_A_TEACHER"
      );
    }

    const classes = await this.prisma.class.findMany({
      where: {
        courseId,
        tenantId,
        ...(input.classIds?.length && { id: { in: input.classIds } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (classes.length === 0) {
      throw new ValidationError(
        "Nenhuma turma deste curso para aplicar a grade",
        "CURRICULUM_NO_CLASSES"
      );
    }

    const mode = input.existing ?? "skip";
    const result: ApplyCurriculumOutput = {
      classesAffected: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      details: [],
    };

    for (const classItem of classes) {
      let touched = false;

      for (const row of input.subjects) {
        const subject = subjectById.get(row.subjectId)!;
        const requested = [...new Set((row.teacherIds ?? []).filter(Boolean))];
        if (requested.length === 0) {
          throw new ValidationError(
            `Escolha o professor de ${subject.name}`,
            "CURRICULUM_NO_TEACHERS"
          );
        }

        const lessonsPerSession = row.lessonsPerSession ?? 1;
        const totalLessonsPlanned = row.totalLessonsPlanned ?? 0;
        const lessonDurationMin = row.lessonDurationMin ?? defaultLessonDurationMin;

        const existing = await this.prisma.classSubject.findUnique({
          where: {
            classId_subjectId: { classId: classItem.id, subjectId: row.subjectId },
          },
          select: { id: true },
        });

        if (existing && mode === "skip") {
          result.skipped += 1;
          result.details.push({
            classId: classItem.id,
            className: classItem.name,
            subjectName: subject.name,
            action: "skipped",
            reason: "A turma já cursa esta disciplina",
          });
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          const classSubject = await tx.classSubject.upsert({
            where: {
              classId_subjectId: { classId: classItem.id, subjectId: row.subjectId },
            },
            create: {
              tenantId,
              classId: classItem.id,
              subjectId: row.subjectId,
              teacherId: requested[0],
              lessonsPerSession,
              totalLessonsPlanned,
              lessonDurationMin,
            },
            update: {
              lessonsPerSession,
              totalLessonsPlanned,
              lessonDurationMin,
              // "sync" mexe só na carga: trocar o professor de 50 turmas sem
              // pedir é o tipo de coisa que ninguém desfaz depois
              ...(mode === "replace" && { teacherId: requested[0] }),
            },
            select: { id: true },
          });

          if (!existing || mode === "replace") {
            await tx.classSubjectTeacher.deleteMany({
              where: { classSubjectId: classSubject.id, teacherId: { notIn: requested } },
            });
            for (const teacherId of requested) {
              await tx.classSubjectTeacher.upsert({
                where: {
                  classSubjectId_teacherId: {
                    classSubjectId: classSubject.id,
                    teacherId,
                  },
                },
                create: {
                  classSubjectId: classSubject.id,
                  teacherId,
                  isPrimary: teacherId === requested[0],
                },
                update: { isPrimary: teacherId === requested[0] },
              });
            }
          }
        });

        touched = true;
        if (existing) {
          result.updated += 1;
          result.details.push({
            classId: classItem.id,
            className: classItem.name,
            subjectName: subject.name,
            action: "updated",
          });
        } else {
          result.created += 1;
          result.details.push({
            classId: classItem.id,
            className: classItem.name,
            subjectName: subject.name,
            action: "created",
          });
        }
      }

      if (touched) result.classesAffected += 1;
    }

    // Operação em lote: um evento resumido em vez de um por turma tocada —
    // a lista detalhada de turmas fica no metadata para quem abrir o evento
    auditService.record({
      action: "course.curriculum_applied",
      tenantId,
      targetId: courseId,
      targetLabel: course.name,
      details: `Grade curricular aplicada em ${result.classesAffected} turma(s): ${result.created} criada(s), ${result.updated} atualizada(s), ${result.skipped} preservada(s)`,
      metadata: {
        mode,
        classesAffected: result.classesAffected,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        changes: result.details,
      },
    });

    this.logger.info(
      {
        courseId,
        tenantId,
        classes: classes.length,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        mode,
      },
      "Curriculum applied to classes"
    );

    return result;
  }

  private toOutput(course: any): CourseOutput {
    const unit = (course.lessonDurationUnit ?? "minutes") as LessonDurationUnit;
    const value = course.lessonDuration ?? 50;
    return {
      id: course.id,
      tenantId: course.tenantId,
      academicPeriodId: course.academicPeriodId,
      name: course.name,
      periodName: course.academicPeriod?.name,
      lessonsPerDay: course.lessonsPerDay ?? 4,
      lessonDuration: value,
      lessonDurationUnit: unit,
      lessonDurationMin: lessonDurationToMinutes(value, unit),
      subjectCount: course._count?.subjects,
      createdAt: course.createdAt,
    };
  }
}

export const coursesService = new CoursesService();
