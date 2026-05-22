/**
 * ClassesService
 * Gerencia turmas por tenant.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateClassInput {
  tenantId: string;
  courseId: string;
  name: string;
  teacherId: string;
  room?: string;
  locationId?: string;
  totalClassesPlanned?: number;
}

export interface UpdateClassInput {
  name?: string;
  teacherId?: string;
  room?: string;
  locationId?: string;
  totalClassesPlanned?: number;
}

export interface ClassOutput {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  teacherId: string;
  room?: string;
  locationId?: string;
  totalClassesPlanned: number;
  createdAt: Date;
}

export interface ListClassesParams extends ListParams {
  tenantId: string;
  courseId?: string;
  teacherId?: string;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class ClassesService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "courseId", "teacherId"] as const;

  /**
   * Lista turmas de um tenant.
   */
  async list(params: ListClassesParams): Promise<PaginatedResult<ClassOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, ClassesService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name", "room"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.courseId && { courseId: params.courseId }),
      ...(params.teacherId && { teacherId: params.teacherId }),
      ...(searchOr && { OR: searchOr }),
    };

    const [classes, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({ where, take, skip, orderBy }),
      this.prisma.class.count({ where }),
    ]);

    return this.buildPaginatedResult(
      classes.map(this.toOutput),
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
    });
    if (!classItem) throw new NotFoundError("Class not found");
    return this.toOutput(classItem);
  }

  /**
   * Cria uma nova turma.
   */
  async create(input: CreateClassInput): Promise<ClassOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Validar que o curso existe e pertence ao tenant
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, tenantId: input.tenantId },
    });
    if (!course) throw new NotFoundError("Course not found in this tenant");

    // Validar que o professor existe, é admin, e pertence ao tenant
    const teacher = await this.prisma.user.findFirst({
      where: { id: input.teacherId, tenantId: input.tenantId },
    });
    if (!teacher) throw new NotFoundError("Teacher not found in this tenant");

    // Validar localização se fornecida
    if (input.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId: input.tenantId },
      });
      if (!location) throw new NotFoundError("Location not found in this tenant");
    }

    const classItem = await this.prisma.class.create({
      data: {
        tenantId: input.tenantId,
        courseId: input.courseId,
        name: input.name,
        teacherId: input.teacherId,
        room: input.room,
        locationId: input.locationId,
        totalClassesPlanned: input.totalClassesPlanned || 0,
      },
    });

    this.logger.info({ classId: classItem.id, tenantId: input.tenantId }, "Class created");
    return this.toOutput(classItem);
  }

  /**
   * Atualiza uma turma.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateClassInput
  ): Promise<ClassOutput> {
    const classItem = await this.prisma.class.findFirst({
      where: { id, tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found");

    // Validar professor se fornecido
    if (input.teacherId && input.teacherId !== classItem.teacherId) {
      const teacher = await this.prisma.user.findFirst({
        where: { id: input.teacherId, tenantId },
      });
      if (!teacher) throw new NotFoundError("Teacher not found in this tenant");
    }

    // Validar localização se fornecida
    if (input.locationId !== undefined) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId },
      });
      if (!location) throw new NotFoundError("Location not found in this tenant");
    }

    const updated = await this.prisma.class.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.teacherId && { teacherId: input.teacherId }),
        ...(input.room !== undefined && { room: input.room }),
        ...(input.locationId !== undefined && { locationId: input.locationId }),
        ...(input.totalClassesPlanned !== undefined && { totalClassesPlanned: input.totalClassesPlanned }),
      },
    });

    this.logger.info({ classId: id, tenantId }, "Class updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta uma turma.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const classItem = await this.prisma.class.findFirst({
      where: { id, tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found");

    await this.prisma.class.delete({ where: { id } });
    this.logger.info({ classId: id, tenantId }, "Class deleted");
  }

  private toOutput(classItem: any): ClassOutput {
    return {
      id: classItem.id,
      tenantId: classItem.tenantId,
      courseId: classItem.courseId,
      name: classItem.name,
      teacherId: classItem.teacherId,
      room: classItem.room ?? undefined,
      locationId: classItem.locationId ?? undefined,
      totalClassesPlanned: classItem.totalClassesPlanned,
      createdAt: classItem.createdAt,
    };
  }
}

export const classesService = new ClassesService();
