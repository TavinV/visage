/**
 * ClassEnrollmentsService
 * Gerencia matrículas de alunos em turmas.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ConflictError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateClassEnrollmentInput {
  tenantId: string;
  classId: string;
  userId: string;
}

export interface ClassEnrollmentOutput {
  classId: string;
  userId: string;
  enrolledAt: Date;
  /** Dados do aluno embutidos — evita um fetch de /users por linha no painel. */
  student?: {
    name: string;
    enrollmentCode?: string;
    facialStatus: string;
  };
}

export interface ListClassEnrollmentsParams extends ListParams {
  tenantId: string;
  classId?: string;
  userId?: string;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class ClassEnrollmentsService extends BaseService {
  private static readonly SORT_FIELDS = ["enrolledAt"] as const;

  /**
   * Lista matrículas de um tenant.
   */
  async list(params: ListClassEnrollmentsParams): Promise<PaginatedResult<ClassEnrollmentOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, ClassEnrollmentsService.SORT_FIELDS) ??
      { enrolledAt: "desc" };

    const where = {
      class: {
        tenantId: params.tenantId,
        ...(params.classId && { id: params.classId }),
      },
      ...(params.userId && { userId: params.userId }),
    };

    const [enrollments, total] = await this.prisma.$transaction([
      this.prisma.classEnrollment.findMany({
        where,
        take,
        skip,
        orderBy,
        include: {
          user: { select: { name: true, enrollmentCode: true, facialStatus: true } },
        },
      }),
      this.prisma.classEnrollment.count({ where }),
    ]);

    return this.buildPaginatedResult(
      enrollments.map((e) => this.toOutput(e)),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém uma matrícula específica.
   */
  async findByIds(
    classId: string,
    userId: string,
    tenantId: string
  ): Promise<ClassEnrollmentOutput> {
    // Validar que a turma pertence ao tenant
    const classItem = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!enrollment) throw new NotFoundError("Enrollment not found");
    return this.toOutput(enrollment);
  }

  /**
   * Cria uma nova matrícula.
   */
  async create(input: CreateClassEnrollmentInput): Promise<ClassEnrollmentOutput> {
    // Validar que a turma existe e pertence ao tenant
    const classItem = await this.prisma.class.findFirst({
      where: { id: input.classId, tenantId: input.tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    // Validar que o aluno existe e pertence ao tenant
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId },
    });
    if (!user) throw new NotFoundError("User not found in this tenant");

    // Verificar se já existe matrícula
    const existingEnrollment = await this.prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId: input.classId, userId: input.userId } },
    });
    if (existingEnrollment) throw new ConflictError("User already enrolled in this class");

    const enrollment = await this.prisma.classEnrollment.create({
      data: {
        classId: input.classId,
        userId: input.userId,
      },
    });

    this.logger.info(
      { classId: input.classId, userId: input.userId, tenantId: input.tenantId },
      "Class enrollment created"
    );
    return this.toOutput(enrollment);
  }

  /**
   * Remove uma matrícula.
   */
  async delete(classId: string, userId: string, tenantId: string): Promise<void> {
    // Validar que a turma pertence ao tenant
    const classItem = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!enrollment) throw new NotFoundError("Enrollment not found");

    await this.prisma.classEnrollment.delete({
      where: { classId_userId: { classId, userId } },
    });

    this.logger.info(
      { classId, userId, tenantId },
      "Class enrollment deleted"
    );
  }

  private toOutput(enrollment: any): ClassEnrollmentOutput {
    return {
      classId: enrollment.classId,
      userId: enrollment.userId,
      enrolledAt: enrollment.enrolledAt,
      ...(enrollment.user && {
        student: {
          name: enrollment.user.name,
          enrollmentCode: enrollment.user.enrollmentCode ?? undefined,
          facialStatus: enrollment.user.facialStatus,
        },
      }),
    };
  }
}

export const classEnrollmentsService = new ClassEnrollmentsService();
