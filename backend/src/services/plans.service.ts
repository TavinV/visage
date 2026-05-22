/**
 * PlansService
 * Gerenciamento de planos de assinatura.
 * Estende BaseService para paginação, ordenação e busca padronizadas.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import type { Plan } from "@prisma/client";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  name: string;
  maxClasses: number;
  priceMonthly: number;
}

export interface UpdatePlanInput {
  name?: string;
  maxClasses?: number;
  priceMonthly?: number;
  isActive?: boolean;
}

export interface PlanOutput {
  id: string;
  name: string;
  maxClasses: number;
  priceMonthly: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ListPlansParams extends ListParams {
  /** Quando true (padrão), retorna apenas planos ativos. */
  onlyActive?: boolean;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class PlansService extends BaseService {
  private static readonly SORT_FIELDS = [
    "name",
    "priceMonthly",
    "maxClasses",
    "createdAt",
  ] as const;

  /**
   * Lista planos com paginação, ordenação e busca por nome.
   */
  async list(params: ListPlansParams = {}): Promise<PaginatedResult<PlanOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, PlansService.SORT_FIELDS) ??
      { priceMonthly: "asc" };
    const searchOr = this.buildSearchFilter(params.search, ["name"]);

    const where = {
      ...(params.onlyActive !== false && { isActive: true }),
      ...(searchOr && { OR: searchOr }),
    };

    const [plans, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({ where, take, skip, orderBy }),
      this.prisma.plan.count({ where }),
    ]);

    return this.buildPaginatedResult(plans.map(this.toOutput), total, page, limit);
  }

  /**
   * Busca plano por ID. Lança NotFoundError se não existir.
   */
  async findById(id: string): Promise<PlanOutput> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundError("Plan not found");
    return this.toOutput(plan);
  }

  /**
   * Cria novo plano (super_admin only).
   */
  async create(input: CreatePlanInput): Promise<PlanOutput> {
    if (input.maxClasses < 1) {
      throw new ValidationError("maxClasses deve ser ao menos 1");
    }
    if (input.priceMonthly < 0) {
      throw new ValidationError("priceMonthly não pode ser negativo");
    }

    const existing = await this.prisma.plan.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" } },
    });
    if (existing) {
      throw new ConflictError(`Já existe um plano com o nome "${input.name}"`);
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: input.name,
        maxClasses: input.maxClasses,
        priceMonthly: input.priceMonthly,
      },
    });

    this.logger.info({ planId: plan.id, name: plan.name }, "Plan created");
    return this.toOutput(plan);
  }

  /**
   * Atualiza campos de um plano (super_admin only).
   */
  async update(id: string, input: UpdatePlanInput): Promise<PlanOutput> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundError("Plan not found");

    if (input.maxClasses !== undefined && input.maxClasses < 1) {
      throw new ValidationError("maxClasses deve ser ao menos 1");
    }
    if (input.priceMonthly !== undefined && input.priceMonthly < 0) {
      throw new ValidationError("priceMonthly não pode ser negativo");
    }

    if (input.name && input.name !== plan.name) {
      const conflict = await this.prisma.plan.findFirst({
        where: {
          name: { equals: input.name, mode: "insensitive" },
          id: { not: id },
        },
      });
      if (conflict) {
        throw new ConflictError(`Já existe um plano com o nome "${input.name}"`);
      }
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.maxClasses !== undefined && { maxClasses: input.maxClasses }),
        ...(input.priceMonthly !== undefined && { priceMonthly: input.priceMonthly }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    this.logger.info({ planId: id }, "Plan updated");
    return this.toOutput(updated);
  }

  /**
   * Desativa um plano (soft delete — tenants existentes permanecem intactos).
   */
  async deactivate(id: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!plan) throw new NotFoundError("Plan not found");

    await this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.info(
      { planId: id, affectedTenants: plan._count.tenants },
      "Plan deactivated",
    );
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  private toOutput(plan: Plan): PlanOutput {
    return {
      id: plan.id,
      name: plan.name,
      maxClasses: plan.maxClasses,
      priceMonthly: plan.priceMonthly.toString(),
      isActive: plan.isActive,
      createdAt: plan.createdAt,
    };
  }
}

export const plansService = new PlansService();
