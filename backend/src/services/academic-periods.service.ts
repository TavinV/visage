/**
 * AcademicPeriodsService
 * Gerencia períodos acadêmicos por tenant.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";

/** Campos do período letivo acompanhados pela trilha de auditoria. */
const PERIOD_FIELDS = ["name", "startsAt", "endsAt", "isActive"] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateAcademicPeriodInput {
  tenantId: string;
  name: string;
  startsAt: string; // ISO date
  endsAt: string; // ISO date
}

export interface UpdateAcademicPeriodInput {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}

export interface AcademicPeriodOutput {
  id: string;
  tenantId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ListAcademicPeriodsParams extends ListParams {
  tenantId: string;
  isActive?: boolean;
  /** "current" (vigente agora) | "past" (encerrado) | "future" (ainda não começou). */
  temporal?: string[];
  startsFrom?: Date;
  startsTo?: Date;
  endsFrom?: Date;
  endsTo?: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class AcademicPeriodsService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "startsAt", "isActive"] as const;

  /**
   * Lista períodos acadêmicos de um tenant.
   */
  async list(params: ListAcademicPeriodsParams): Promise<PaginatedResult<AcademicPeriodOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, AcademicPeriodsService.SORT_FIELDS) ??
      { startsAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...this.temporalCondition(params.temporal),
      ...this.buildDateRange("startsAt", params.startsFrom, params.startsTo),
      ...this.buildDateRange("endsAt", params.endsFrom, params.endsTo),
      ...(searchOr && { OR: searchOr }),
    };

    const [periods, total] = await this.prisma.$transaction([
      this.prisma.academicPeriod.findMany({ where, take, skip, orderBy }),
      this.prisma.academicPeriod.count({ where }),
    ]);

    return this.buildPaginatedResult(
      periods.map(this.toOutput),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém um período acadêmico pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<AcademicPeriodOutput> {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) throw new NotFoundError("Academic period not found");
    return this.toOutput(period);
  }

  /**
   * Cria um novo período acadêmico.
   */
  async create(input: CreateAcademicPeriodInput): Promise<AcademicPeriodOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const period = await this.prisma.academicPeriod.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        isActive: true,
      },
    });

    auditService.record({
      action: "period.created",
      tenantId: input.tenantId,
      targetId: period.id,
      targetLabel: period.name,
      afterState: snapshot(period, PERIOD_FIELDS),
    });

    this.logger.info({ periodId: period.id, tenantId: input.tenantId }, "Academic period created");
    return this.toOutput(period);
  }

  /**
   * Atualiza um período acadêmico.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateAcademicPeriodInput
  ): Promise<AcademicPeriodOutput> {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) throw new NotFoundError("Academic period not found");

    const updated = await this.prisma.academicPeriod.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
        ...(input.endsAt && { endsAt: new Date(input.endsAt) }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    auditService.recordChange({
      action: "period.updated",
      tenantId,
      targetId: id,
      targetLabel: updated.name,
      before: period,
      after: updated,
      fields: PERIOD_FIELDS,
    });

    this.logger.info({ periodId: id, tenantId }, "Academic period updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta um período acadêmico.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) throw new NotFoundError("Academic period not found");

    await this.prisma.academicPeriod.delete({ where: { id } });

    auditService.record({
      action: "period.deleted",
      tenantId,
      targetId: id,
      targetLabel: period.name,
      beforeState: snapshot(period, PERIOD_FIELDS),
    });

    this.logger.info({ periodId: id, tenantId }, "Academic period deleted");
  }

  /**
   * "Vigente agora" / "encerrado" / "futuro" — comparação de datas que a
   * secretaria faria de cabeça toda vez que olhasse pra lista, feita uma vez
   * aqui. Mais de um balde marcado vira OR entre eles.
   */
  private temporalCondition(buckets?: string[]) {
    if (!buckets || buckets.length === 0) return undefined;
    const now = new Date();
    const conditions = buckets
      .map((bucket) => {
        if (bucket === "current") return { startsAt: { lte: now }, endsAt: { gte: now } };
        if (bucket === "past") return { endsAt: { lt: now } };
        if (bucket === "future") return { startsAt: { gt: now } };
        return undefined;
      })
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    if (conditions.length === 0) return undefined;
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

  private toOutput(period: any): AcademicPeriodOutput {
    return {
      id: period.id,
      tenantId: period.tenantId,
      name: period.name,
      startsAt: period.startsAt.toISOString().split("T")[0],
      endsAt: period.endsAt.toISOString().split("T")[0],
      isActive: period.isActive,
      createdAt: period.createdAt,
    };
  }
}

export const academicPeriodsService = new AcademicPeriodsService();
