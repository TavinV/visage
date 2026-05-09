/**
 * Tenants Service
 * Lógica de negócio para criar e gerenciar tenants
 */

import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { generateKey, generateIV } from "../utils/crypto";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import { config } from "../lib/config";
import crypto from "crypto";

export interface CreateTenantInput {
  name: string;
  document?: string;
  institutionType: "school" | "university";
  planId: number;
  email?: string;
}

export interface CreateTenantOutput {
  id: number;
  name: string;
  document?: string;
  institutionType: string;
  status: string;
  createdAt: Date;
}

/**
 * Cria um novo tenant com DEK cifrada
 */
export async function createTenant(
  input: CreateTenantInput
): Promise<CreateTenantOutput> {
  try {
    // Validar plano
    const plan = await prisma.plan.findUnique({
      where: { id: input.planId },
    });

    if (!plan) {
      throw new NotFoundError("Plan not found");
    }

    if (!plan.isActive) {
      throw new ValidationError("Plan is not active");
    }

    // Gerar DEK
    const dek = generateKey(32); // 32 bytes = 256 bits
    const masterKey = Buffer.from(config.masterKey, "hex");

    // Cifrar DEK com MASTER_KEY usando AES-256-GCM
    const iv = generateIV();
    const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
    const encryptedData = cipher.update(dek);
    cipher.final();
    const tag = cipher.getAuthTag();
    const ciphertext = encryptedData;

    // Criar tenant em transação
    const tenant = await prisma.$transaction(async (tx) => {
      // Criar tenant
      const newTenant = await tx.tenant.create({
        data: {
          name: input.name,
          document: input.document,
          institutionType: input.institutionType,
          planId: input.planId,
          status: "trial",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 dias
        },
      });

      // Criar tenant_keys
      await tx.tenantKeys.create({
        data: {
          tenantId: newTenant.id,
          dekCt: ciphertext,
          dekIv: iv,
          dekTag: tag,
          keyVersion: 1,
        },
      });

      // Criar tenant_settings
      await tx.tenantSettings.create({
        data: {
          tenantId: newTenant.id,
        },
      });

      return newTenant;
    });

    logger.info(
      { tenantId: tenant.id, name: tenant.name },
      "Tenant created successfully"
    );

    return {
      id: tenant.id,
      name: tenant.name,
      document: tenant.document || undefined,
      institutionType: tenant.institutionType,
      status: tenant.status,
      createdAt: tenant.createdAt,
    };
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }

    logger.error({ error }, "Error creating tenant");
    throw error;
  }
}

/**
 * Busca tenant por ID
 */
export async function getTenantById(tenantId: number) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan: true,
      settings: true,
    },
  });

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  return tenant;
}

/**
 * Lista todos os tenants (super admin only)
 */
export async function listTenants(limit: number = 50, offset: number = 0) {
  const tenants = await prisma.tenant.findMany({
    take: limit,
    skip: offset,
    include: {
      plan: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.tenant.count();

  return {
    data: tenants,
    pagination: {
      total,
      limit,
      offset,
    },
  };
}
