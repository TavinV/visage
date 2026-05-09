/**
 * Plans Service
 * Gerenciamento de planos de assinatura
 */

import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";

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
  id: number;
  name: string;
  maxClasses: number;
  priceMonthly: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Lista todos os planos ativos
 */
export async function listPlans(onlyActive = true): Promise<PlanOutput[]> {
  const plans = await prisma.plan.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    orderBy: { priceMonthly: "asc" },
  });

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    maxClasses: p.maxClasses,
    priceMonthly: p.priceMonthly.toString(),
    isActive: p.isActive,
    createdAt: p.createdAt,
  }));
}

/**
 * Busca plano por ID
 */
export async function getPlanById(id: number): Promise<PlanOutput> {
  const plan = await prisma.plan.findUnique({ where: { id } });

  if (!plan) {
    throw new NotFoundError("Plan not found");
  }

  return {
    id: plan.id,
    name: plan.name,
    maxClasses: plan.maxClasses,
    priceMonthly: plan.priceMonthly.toString(),
    isActive: plan.isActive,
    createdAt: plan.createdAt,
  };
}

/**
 * Cria novo plano (super_admin only)
 */
export async function createPlan(input: CreatePlanInput): Promise<PlanOutput> {
  if (input.maxClasses < 1) {
    throw new ValidationError("maxClasses deve ser ao menos 1");
  }

  if (input.priceMonthly < 0) {
    throw new ValidationError("priceMonthly não pode ser negativo");
  }

  const existing = await prisma.plan.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" } },
  });

  if (existing) {
    throw new ConflictError(`Já existe um plano com o nome "${input.name}"`);
  }

  const plan = await prisma.plan.create({
    data: {
      name: input.name,
      maxClasses: input.maxClasses,
      priceMonthly: input.priceMonthly,
    },
  });

  logger.info({ planId: plan.id, name: plan.name }, "Plan created");

  return {
    id: plan.id,
    name: plan.name,
    maxClasses: plan.maxClasses,
    priceMonthly: plan.priceMonthly.toString(),
    isActive: plan.isActive,
    createdAt: plan.createdAt,
  };
}

/**
 * Atualiza campos de um plano (super_admin only)
 */
export async function updatePlan(
  id: number,
  input: UpdatePlanInput
): Promise<PlanOutput> {
  const plan = await prisma.plan.findUnique({ where: { id } });

  if (!plan) {
    throw new NotFoundError("Plan not found");
  }

  if (input.maxClasses !== undefined && input.maxClasses < 1) {
    throw new ValidationError("maxClasses deve ser ao menos 1");
  }

  if (input.priceMonthly !== undefined && input.priceMonthly < 0) {
    throw new ValidationError("priceMonthly não pode ser negativo");
  }

  if (input.name && input.name !== plan.name) {
    const conflict = await prisma.plan.findFirst({
      where: {
        name: { equals: input.name, mode: "insensitive" },
        id: { not: id },
      },
    });

    if (conflict) {
      throw new ConflictError(`Já existe um plano com o nome "${input.name}"`);
    }
  }

  const updated = await prisma.plan.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.maxClasses !== undefined && { maxClasses: input.maxClasses }),
      ...(input.priceMonthly !== undefined && { priceMonthly: input.priceMonthly }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  logger.info({ planId: id }, "Plan updated");

  return {
    id: updated.id,
    name: updated.name,
    maxClasses: updated.maxClasses,
    priceMonthly: updated.priceMonthly.toString(),
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  };
}

/**
 * Desativa um plano (soft delete — mantém tenants existentes intactos)
 */
export async function deactivatePlan(id: number): Promise<void> {
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { tenants: true } } },
  });

  if (!plan) {
    throw new NotFoundError("Plan not found");
  }

  await prisma.plan.update({
    where: { id },
    data: { isActive: false },
  });

  logger.info({ planId: id, affectedTenants: plan._count.tenants }, "Plan deactivated");
}
