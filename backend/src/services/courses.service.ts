/**
 * CoursesService
 * Gerencia cursos por tenant e período acadêmico.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCourseInput {
  tenantId: string;
  academicPeriodId: string;
  name: string;
}

export interface UpdateCourseInput {
  name?: string;
  academicPeriodId?: string;
}

export interface CourseOutput {
  id: string;
  tenantId: string;
  academicPeriodId: string;
  name: string;
  createdAt: Date;
}

export interface ListCoursesParams extends ListParams {
  tenantId: string;
  academicPeriodId?: string;
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
      ...(searchOr && { OR: searchOr }),
    };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where, take, skip, orderBy }),
      this.prisma.course.count({ where }),
    ]);

    return this.buildPaginatedResult(
      courses.map(this.toOutput),
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

    const course = await this.prisma.course.create({
      data: {
        tenantId: input.tenantId,
        academicPeriodId: input.academicPeriodId,
        name: input.name,
      },
    });

    this.logger.info({ courseId: course.id, tenantId: input.tenantId }, "Course created");
    return this.toOutput(course);
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

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.academicPeriodId && { academicPeriodId: input.academicPeriodId }),
      },
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
    });
    if (!course) throw new NotFoundError("Course not found");

    await this.prisma.course.delete({ where: { id } });
    this.logger.info({ courseId: id, tenantId }, "Course deleted");
  }

  private toOutput(course: any): CourseOutput {
    return {
      id: course.id,
      tenantId: course.tenantId,
      academicPeriodId: course.academicPeriodId,
      name: course.name,
      createdAt: course.createdAt,
    };
  }
}

export const coursesService = new CoursesService();
