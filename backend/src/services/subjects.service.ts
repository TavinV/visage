/**
 * SubjectsService
 * Catálogo de disciplinas de um curso.
 *
 * Aqui a disciplina é só o nome no currículo do curso ("Matemática" em
 * Técnico em Mecânica). Quem leciona e quanta carga tem é decidido POR TURMA,
 * em ClassSubject — a mesma Matemática pode ter professor e carga diferentes
 * no 3ºA e no 3ºB.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";

/** Campos da disciplina acompanhados pela trilha de auditoria. */
const SUBJECT_FIELDS = ["name", "code", "isActive"] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateSubjectInput {
  tenantId: string;
  courseId: string;
  name: string;
  code?: string;
}

export interface UpdateSubjectInput {
  name?: string;
  code?: string | null;
  isActive?: boolean;
}

export interface SubjectOutput {
  id: string;
  tenantId: string;
  courseId: string;
  courseName?: string;
  name: string;
  code?: string;
  isActive: boolean;
  /** Em quantas turmas esta disciplina é cursada. */
  classCount?: number;
  createdAt: Date;
}

export interface ListSubjectsParams extends ListParams {
  tenantId: string;
  courseId?: string;
  /** Disciplinas que um professor leciona em alguma turma. */
  teacherId?: string;
  isActive?: boolean;
}

// ── Helpers de duração ───────────────────────────────────────────────────────

/**
 * Converte a duração da aula configurada no curso para minutos. A unidade é
 * escolha de apresentação da secretaria; todo cálculo de tempo usa minutos.
 */
export function lessonDurationToMinutes(duration: number, unit: string): number {
  const minutes = unit === "hours" ? duration * 60 : duration;
  // Piso de 1 minuto evita divisão por zero no cálculo de aulas do checkout
  return Math.max(1, Math.round(minutes));
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class SubjectsService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "code", "createdAt"] as const;

  private static readonly INCLUDE = {
    course: { select: { name: true } },
    _count: { select: { classSubjects: true } },
  } as const;

  async list(params: ListSubjectsParams): Promise<PaginatedResult<SubjectOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, SubjectsService.SORT_FIELDS) ??
      { name: "asc" as const };
    const searchOr = this.buildSearchFilter(params.search, ["name", "code"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.courseId && { courseId: params.courseId }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...(params.teacherId && {
        // Alocado no time da disciplina, não só responsável por ela
        classSubjects: { some: { teachers: { some: { teacherId: params.teacherId } } } },
      }),
      ...(searchOr && { OR: searchOr }),
    };

    const [subjects, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        take,
        skip,
        orderBy,
        include: SubjectsService.INCLUDE,
      }),
      this.prisma.subject.count({ where }),
    ]);

    return this.buildPaginatedResult(
      subjects.map((s) => this.toOutput(s)),
      total,
      page,
      limit
    );
  }

  async findById(id: string, tenantId: string): Promise<SubjectOutput> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
      include: SubjectsService.INCLUDE,
    });
    if (!subject) throw new NotFoundError("Disciplina não encontrada");
    return this.toOutput(subject);
  }

  async create(input: CreateSubjectInput): Promise<SubjectOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!course) throw new NotFoundError("Curso não encontrado nesta instituição");

    const duplicate = await this.prisma.subject.findFirst({
      where: { courseId: input.courseId, name: input.name },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError("Este curso já tem uma disciplina com esse nome");
    }

    const subject = await this.prisma.subject.create({
      data: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        name: input.name,
        code: input.code ?? null,
      },
      include: SubjectsService.INCLUDE,
    });

    auditService.record({
      action: "subject.created",
      tenantId: input.tenantId,
      targetId: subject.id,
      targetLabel: subject.name,
      afterState: snapshot(subject, SUBJECT_FIELDS),
      metadata: { courseId: input.courseId },
    });

    this.logger.info(
      { subjectId: subject.id, courseId: input.courseId, tenantId: input.tenantId },
      "Subject created"
    );
    return this.toOutput(subject);
  }

  async update(id: string, tenantId: string, input: UpdateSubjectInput): Promise<SubjectOutput> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
    });
    if (!subject) throw new NotFoundError("Disciplina não encontrada");

    if (input.name) {
      const duplicate = await this.prisma.subject.findFirst({
        where: { courseId: subject.courseId, name: input.name, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError("Este curso já tem uma disciplina com esse nome");
      }
    }

    const updated = await this.prisma.subject.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code !== undefined && { code: input.code }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: SubjectsService.INCLUDE,
    });

    auditService.recordChange({
      action: "subject.updated",
      tenantId,
      targetId: id,
      targetLabel: updated.name,
      before: subject,
      after: updated,
      fields: SUBJECT_FIELDS,
    });

    this.logger.info({ subjectId: id, tenantId }, "Subject updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta uma disciplina do catálogo. Bloqueado enquanto alguma turma a
   * cursar — sairia com o histórico de presença junto.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { classSubjects: true } } },
    });
    if (!subject) throw new NotFoundError("Disciplina não encontrada");

    if (subject._count.classSubjects > 0) {
      throw new ValidationError(
        `Esta disciplina é cursada por ${subject._count.classSubjects} turma(s). Remova-a das turmas antes de excluir.`,
        "SUBJECT_IN_USE"
      );
    }

    await this.prisma.subject.delete({ where: { id } });

    auditService.record({
      action: "subject.deleted",
      tenantId,
      targetId: id,
      targetLabel: subject.name,
      beforeState: snapshot(subject, SUBJECT_FIELDS),
    });

    this.logger.info({ subjectId: id, tenantId }, "Subject deleted");
  }

  private toOutput(subject: any): SubjectOutput {
    return {
      id: subject.id,
      tenantId: subject.tenantId,
      courseId: subject.courseId,
      courseName: subject.course?.name,
      name: subject.name,
      code: subject.code ?? undefined,
      isActive: subject.isActive,
      classCount: subject._count?.classSubjects,
      createdAt: subject.createdAt,
    };
  }
}

export const subjectsService = new SubjectsService();
