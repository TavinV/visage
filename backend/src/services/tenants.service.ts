/**
 * TenantsService
 * Lógica de negócio para criar e gerenciar tenants.
 * Estende BaseService para paginação, ordenação e busca padronizadas.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { generateKey, generateIV } from "../utils/crypto";
import { NotFoundError, ValidationError } from "../utils/errors";
import { normalizeDocument } from "../utils/cpfQr";
import { config } from "../lib/config";
import { emailService } from "./email.service";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";
import crypto from "crypto";
import bcryptjs from "bcryptjs";

/** Campos da instituição acompanhados pela trilha de auditoria. */
const TENANT_FIELDS = [
  "name",
  "document",
  "institutionType",
  "status",
  "planId",
  "timezone",
] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
  document?: string;
  institutionType: "school" | "university";
  planId: string;
  adminUser: {
    name: string;
    email: string;
  };
}

export interface TenantOutput {
  id: string;
  name: string;
  document?: string;
  institutionType: string;
  status: string;
  createdAt: Date;
}

export interface ListTenantsParams extends ListParams {
  status?: string;
  institutionType?: "school" | "university";
  /**
   * Inclui instituições canceladas. Cancelar é o "excluir" do contrato — o
   * registro fica para histórico e cobrança, mas some da lista por padrão.
   */
  includeInactive?: boolean;
}

export interface UpdateTenantInput {
  name?: string;
  document?: string;
  institutionType?: "school" | "university";
  planId?: string;
  timezone?: string;
  status?: "trial" | "active" | "suspended" | "cancelled";
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class TenantsService extends BaseService {
  private static readonly SORT_FIELDS = [
    "name",
    "createdAt",
    "status",
    "institutionType",
  ] as const;

  /**
   * Lista tenants com paginação, ordenação e busca por nome (super_admin only).
   */
  async list(params: ListTenantsParams = {}): Promise<PaginatedResult<object>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, TenantsService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name", "document"]);

    const where = {
      // Status explícito manda: filtrar por "cancelada" não pode esbarrar no
      // filtro padrão que justamente as esconde
      ...(params.status
        ? { status: params.status }
        : !params.includeInactive && { status: { not: "cancelled" } }),
      ...(params.institutionType && { institutionType: params.institutionType }),
      ...(searchOr && { OR: searchOr }),
    };

    const [tenants, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        take,
        skip,
        orderBy,
        include: {
          plan: true,
          _count: { select: { users: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return this.buildPaginatedResult(tenants, total, page, limit);
  }

  /**
   * Busca tenant por ID. Lança NotFoundError se não existir.
   */
  async findById(tenantId: string): Promise<object> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, settings: true },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
    return tenant;
  }

  /**
   * Cria novo tenant com DEK cifrada (super_admin only).
   * Realiza em uma única transação: tenant + tenant_keys + tenant_settings.
   */
  async create(input: CreateTenantInput): Promise<TenantOutput> {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundError("Plan not found");
    if (!plan.isActive) throw new ValidationError("Plan is not active");

    // Gerar e cifrar DEK com MASTER_KEY (AES-256-GCM)
    const dek = generateKey(32);
    const masterKey = Buffer.from(config.masterKey, "hex");
    const iv = generateIV();
    const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
    const encryptedData = cipher.update(dek);
    cipher.final();
    const tag = cipher.getAuthTag();

    const tenant = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: input.name,
          document: input.document ? normalizeDocument(input.document) : undefined,
          institutionType: input.institutionType,
          planId: input.planId,
          status: "trial",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.tenantKeys.create({
        data: {
          tenantId: newTenant.id,
          dekCt: new Uint8Array(encryptedData),
          dekIv: new Uint8Array(iv),
          dekTag: new Uint8Array(tag),
          keyVersion: 1,
        },
      });

      await tx.tenantSettings.create({
        data: { tenantId: newTenant.id },
      });

      // Criar usuário admin inicial do tenant
      const adminPassword = this.generateSecurePassword();
      const passwordHash = await bcryptjs.hash(adminPassword, 12);

      await tx.user.create({
        data: {
          tenantId: newTenant.id,
          name: input.adminUser.name,
          email: input.adminUser.email,
          role: "admin",
          passwordHash,
          status: "active",
        },
      });

      return { tenant: newTenant, adminPassword };
    });

    auditService.record({
      action: "tenant.created",
      tenantId: tenant.tenant.id,
      targetId: tenant.tenant.id,
      targetLabel: tenant.tenant.name,
      afterState: snapshot(tenant.tenant, TENANT_FIELDS),
      details: `Instituição "${tenant.tenant.name}" criada no plano ${plan.name}, com admin inicial ${input.adminUser.email}`,
      metadata: {
        planName: plan.name,
        adminEmail: input.adminUser.email,
        adminName: input.adminUser.name,
      },
    });

    this.logger.info(
      { tenantId: tenant.tenant.id, name: tenant.tenant.name },
      "Tenant created",
    );

    // Enviar credenciais iniciais ao admin por email (fora da transação)
    try {
      await emailService.send({
        to: input.adminUser.email,
        templateId: "admin-credentials",
        context: {
          name: input.adminUser.name,
          institutionName: input.name,
          email: input.adminUser.email,
          temporaryPassword: tenant.adminPassword,
          dashboardUrl: config.apiUrl,
        },
      });
    } catch (err) {
      // Email failure não deve reverter a criação do tenant
      this.logger.warn(
        { tenantId: tenant.tenant.id, email: input.adminUser.email, err },
        "Failed to send admin credentials email",
      );
    }

    return {
      id: tenant.tenant.id,
      name: tenant.tenant.name,
      document: tenant.tenant.document ?? undefined,
      institutionType: tenant.tenant.institutionType,
      status: tenant.tenant.status,
      createdAt: tenant.tenant.createdAt,
    };
  }

  /**
   * Evento das três transições de status (ativar/suspender/cancelar), que só
   * diferem pela chave e pelo texto. Suspender uma instituição derruba o acesso
   * de todos os usuários dela — sempre entra na trilha, mesmo quando o status
   * já era o mesmo (aí o diff fica vazio e nada é gravado).
   */
  private recordStatusChange(
    action: string,
    before: { id: string; name: string; status: string },
    after: { name: string; status: string },
    details: string,
  ): void {
    auditService.recordChange({
      action,
      tenantId: before.id,
      targetId: before.id,
      targetLabel: after.name,
      before,
      after,
      fields: ["status"],
      details,
    });
  }

  /**
   * Gera senha segura de 16 caracteres usando crypto.randomBytes.
   */
  private generateSecurePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    const bytes = crypto.randomBytes(16);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }

  /**
   * Atualiza um tenant existente (super_admin only).
   */
  async update(tenantId: string, input: UpdateTenantInput): Promise<TenantOutput> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Se planId foi alterado, validar que o novo plano existe
    if (input.planId && input.planId !== tenant.planId) {
      const newPlan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
      if (!newPlan) throw new NotFoundError("Plan not found");
      if (!newPlan.isActive) throw new ValidationError("Plan is not active");
    }
    
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.name && { name: input.name }),
        ...(input.document !== undefined && {
          document: input.document ? normalizeDocument(input.document) : null,
        }),
        ...(input.institutionType && { institutionType: input.institutionType }),
        ...(input.planId && { planId: input.planId }),
        ...(input.timezone && { timezone: input.timezone }),
      },
    });

    auditService.recordChange({
      action: "tenant.updated",
      tenantId,
      targetId: tenantId,
      targetLabel: updated.name,
      before: tenant,
      after: updated,
      fields: TENANT_FIELDS,
    });

    this.logger.info({ tenantId }, "Tenant updated");

    return {
      id: updated.id,
      name: updated.name,
      document: updated.document ?? undefined,
      institutionType: updated.institutionType,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Ativa um tenant (status -> 'active').
   */
  async activate(tenantId: string): Promise<TenantOutput> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "active" },
    });

    this.recordStatusChange("tenant.activated", tenant, updated, "Instituição ativada");
    this.logger.info({ tenantId }, "Tenant activated");

    return {
      id: updated.id,
      name: updated.name,
      document: updated.document ?? undefined,
      institutionType: updated.institutionType,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Desativa um tenant (status -> 'suspended').
   */
  async deactivate(tenantId: string): Promise<TenantOutput> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "suspended" },
    });

    this.recordStatusChange(
      "tenant.deactivated",
      tenant,
      updated,
      "Instituição suspensa — o acesso ao console e aos totens fica bloqueado",
    );
    this.logger.info({ tenantId }, "Tenant deactivated");

    return {
      id: updated.id,
      name: updated.name,
      document: updated.document ?? undefined,
      institutionType: updated.institutionType,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Cancela um tenant (status -> 'cancelled').
   */
  async cancel(tenantId: string): Promise<TenantOutput> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "cancelled" },
    });

    this.recordStatusChange("tenant.cancelled", tenant, updated, "Instituição cancelada");
    this.logger.info({ tenantId }, "Tenant cancelled");

    return {
      id: updated.id,
      name: updated.name,
      document: updated.document ?? undefined,
      institutionType: updated.institutionType,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  }
}

export const tenantsService = new TenantsService();
