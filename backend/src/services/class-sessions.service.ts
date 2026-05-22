/**
 * ClassSessionsService
 * Gerencia sessões de chamada por turma.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateClassSessionInput {
  tenantId: string;
  classId: string;
  teacherId: string;
  createdById: string;
  classesWorth?: number;
}

export interface UpdateClassSessionInput {
  status?: "open" | "closed";
  classesWorth?: number;
}

export interface ClassSessionOutput {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  createdById: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  classesWorth: number;
  createdAt: Date;
}

export interface ListClassSessionsParams extends ListParams {
  tenantId: string;
  classId?: string;
  status?: "open" | "closed";
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class ClassSessionsService extends BaseService {
  private static readonly SORT_FIELDS = ["startedAt", "createdAt", "status"] as const;

  /**
   * Lista sessões de chamada de um tenant.
   */
  async list(params: ListClassSessionsParams): Promise<PaginatedResult<ClassSessionOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, ClassSessionsService.SORT_FIELDS) ??
      { startedAt: "desc" };

    const where = {
      tenantId: params.tenantId,
      ...(params.classId && { classId: params.classId }),
      ...(params.status && { status: params.status }),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({ where, take, skip, orderBy }),
      this.prisma.classSession.count({ where }),
    ]);

    return this.buildPaginatedResult(
      sessions.map(this.toOutput),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém uma sessão de chamada pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundError("Class session not found");
    return this.toOutput(session);
  }

  /**
   * Cria uma nova sessão de chamada.
   */
  async create(input: CreateClassSessionInput): Promise<ClassSessionOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Validar que a turma existe e pertence ao tenant
    const classItem = await this.prisma.class.findFirst({
      where: { id: input.classId, tenantId: input.tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    // Validar que o professor existe e pertence ao tenant
    const teacher = await this.prisma.user.findFirst({
      where: { id: input.teacherId, tenantId: input.tenantId },
    });
    if (!teacher) throw new NotFoundError("Teacher not found in this tenant");

    // Validar que o criador existe e pertence ao tenant
    const creator = await this.prisma.user.findFirst({
      where: { id: input.createdById, tenantId: input.tenantId },
    });
    if (!creator) throw new NotFoundError("User not found in this tenant");

    const session = await this.prisma.classSession.create({
      data: {
        tenantId: input.tenantId,
        classId: input.classId,
        teacherId: input.teacherId,
        createdById: input.createdById,
        status: "open",
        classesWorth: input.classesWorth || 1,
      },
    });

    this.logger.info(
      { sessionId: session.id, classId: input.classId, tenantId: input.tenantId },
      "Class session created"
    );
    return this.toOutput(session);
  }

  /**
   * Atualiza uma sessão de chamada.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateClassSessionInput
  ): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundError("Class session not found");

    // Se fechando, defina endedAt
    const data: any = {
      ...(input.status && { status: input.status }),
      ...(input.classesWorth !== undefined && { classesWorth: input.classesWorth }),
    };

    if (input.status === "closed" && session.status === "open") {
      data.endedAt = new Date();
    }

    const updated = await this.prisma.classSession.update({
      where: { id },
      data,
    });

    this.logger.info({ sessionId: id, tenantId }, "Class session updated");
    return this.toOutput(updated);
  }

  /**
   * Fecha uma sessão de chamada.
   */
  async close(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundError("Class session not found");

    if (session.status === "closed") {
      throw new ValidationError("Session is already closed");
    }

    const updated = await this.prisma.classSession.update({
      where: { id },
      data: { status: "closed", endedAt: new Date() },
    });

    this.logger.info({ sessionId: id, tenantId }, "Class session closed");
    return this.toOutput(updated);
  }

  private toOutput(session: any): ClassSessionOutput {
    return {
      id: session.id,
      tenantId: session.tenantId,
      classId: session.classId,
      teacherId: session.teacherId,
      createdById: session.createdById,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      status: session.status,
      classesWorth: session.classesWorth,
      createdAt: session.createdAt,
    };
  }
}

export const classSessionsService = new ClassSessionsService();
