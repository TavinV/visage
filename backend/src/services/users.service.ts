/**
 * UsersService
 * Gerenciamento de usuários — criar, listar, atualizar, deletar e alterar senha.
 * Estende BaseService para acesso centralizado ao prisma e logger.
 *
 * RULE: Todo usuário é isolado por tenantId.
 * Admin pode gerenciar usuários do seu próprio tenant.
 */

import { Prisma } from "@prisma/client";
import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors";
import { normalizeDocument, isValidCpf } from "../utils/cpfQr";
import { engineInvalidateEmbedding } from "../lib/faceEngine";
import bcryptjs from "bcryptjs";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string;
  email?: string;
  password?: string;
  role: "admin" | "manager" | "teacher" | "student";
  document?: string;
  enrollmentCode?: string;
  tenantId: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: "admin" | "manager" | "teacher" | "student";
  document?: string | null;
  enrollmentCode?: string | null;
  status?: "active" | "inactive" | "pending";
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface UserOutput {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  role: string;
  status: string;
  document?: string;
  enrollmentCode?: string;
  facialStatus: string;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListUsersParams extends ListParams {
  tenantId: string; // obrigatório — isolamento tenant
  role?: string; // filtro opcional por role
  status?: string; // filtro opcional por status
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class UsersService extends BaseService {
  /** Campos aceitos em sortBy (allowlist de segurança). */
  private static readonly SORT_FIELDS = [
    "name",
    "email",
    "role",
    "status",
    "createdAt",
  ] as const;

  /**
   * Listar usuários do tenant com filtros, busca e paginação
   */
  async list(
    params: ListUsersParams,
  ): Promise<PaginatedResult<UserOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy = this.buildOrderBy(
      params.sortBy,
      params.sortOrder,
      UsersService.SORT_FIELDS,
    ) ?? { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, [
      "name",
      "email",
    ]);

    const where = {
      tenantId: params.tenantId,
      ...(params.role && { role: params.role }),
      ...(params.status && { status: params.status }),
      ...(searchOr && { OR: searchOr }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        take,
        skip,
        orderBy,
        select: this.getUserSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return this.buildPaginatedResult(
      rows.map(this.toOutput),
      total,
      page,
      limit,
    );
  }

  /**
   * Obter usuário por ID
   */
  async findById(id: string, tenantId: string): Promise<UserOutput> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId }, // validar tenant
      select: this.getUserSelect(),
    });

    if (!user) {
      throw new NotFoundError("user_not_found");
    }

    return this.toOutput(user);
  }

  /**
   * Criar novo usuário
   */
  async create(input: CreateUserInput): Promise<UserOutput & { temporaryPassword?: string }> {
    // Validar email único por tenant
    if (input.email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          tenantId: input.tenantId,
          email: input.email,
        },
      });

      if (existing) {
        throw new ConflictError("email_already_exists");
      }
    }

    // Quem acessa o painel recebe senha temporária gerada aqui e é obrigado
    // a trocá-la no primeiro acesso. Alunos não têm senha (acesso via totem).
    let passwordHash: string | null = null;
    let temporaryPassword: string | undefined;
    if (input.role !== "student") {
      if (!input.email) {
        throw new ValidationError("email_required_for_panel_roles");
      }
      temporaryPassword = this.generateTemporaryPassword();
      passwordHash = await bcryptjs.hash(temporaryPassword, 12);
    }

    const normalizedDoc = input.document ? normalizeDocument(input.document) : null;

    // Validar CPF matematicamente (dígitos verificadores)
    if (normalizedDoc && !isValidCpf(normalizedDoc)) {
      throw new ValidationError("invalid_cpf");
    }

    // Validar CPF único no tenant quando fornecido
    if (normalizedDoc) {
      const docExists = await this.prisma.user.findFirst({
        where: { tenantId: input.tenantId, document: normalizedDoc },
      });
      if (docExists) throw new ConflictError("document_already_exists");
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        email: input.email || null,
        role: input.role,
        passwordHash,
        mustChangePassword: temporaryPassword !== undefined,
        document: normalizedDoc,
        // Código interno só faz sentido para alunos
        enrollmentCode: input.role === "student" ? input.enrollmentCode || null : null,
        status: "active",
      },
      select: this.getUserSelect(),
    });

    this.logger.info(
      { userId: user.id, tenantId: input.tenantId, role: input.role },
      "User created",
    );

    return { ...this.toOutput(user), temporaryPassword };
  }

  /**
   * Atualizar usuário
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateUserInput,
  ): Promise<UserOutput> {
    // Validar que usuário existe no tenant
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("user_not_found");
    }

    // Se email está sendo atualizado, validar unicidade no tenant
    if (input.email && input.email !== existing.email) {
      const duplicate = await this.prisma.user.findFirst({
        where: {
          tenantId,
          email: input.email,
        },
      });

      if (duplicate) {
        throw new ConflictError("email_already_exists");
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.email && { email: input.email }),
        ...(input.role && { role: input.role }),
        ...(input.document !== undefined && (() => {
          const doc = input.document ? normalizeDocument(input.document) : null;
          if (doc && !isValidCpf(doc)) throw new ValidationError("invalid_cpf");
          return { document: doc };
        })()),
        ...(input.enrollmentCode !== undefined && {
          enrollmentCode: input.enrollmentCode || null,
        }),
        ...(input.status && { status: input.status }),
      },
      select: this.getUserSelect(),
    });

    this.logger.info(
      { userId: id, tenantId },
      "User updated",
    );

    return this.toOutput(user);
  }

  /**
   * Alterar senha de um usuário
   */
  async changePassword(
    userId: string,
    tenantId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, passwordHash: true },
    });
    
    if (!user) {
      throw new NotFoundError("user_not_found");
    }

    // Validar senha atual
    if (!user.passwordHash) {
      throw new ValidationError("user_has_no_password");
    }

    const passwordMatch = await bcryptjs.compare(
      input.currentPassword,
      user.passwordHash,
    );

    if (!passwordMatch) {
      throw new ValidationError("current_password_incorrect");
    }

    // Validar nova senha
    if (input.newPassword.length < 8) {
      throw new ValidationError("password_too_short");
    }

    if (input.currentPassword === input.newPassword) {
      throw new ValidationError("new_password_same_as_current");
    }

    const newPasswordHash = await bcryptjs.hash(input.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      // Troca voluntária ou de primeiro acesso — o flag é sempre liberado
      data: { passwordHash: newPasswordHash, mustChangePassword: false },
    });

    this.logger.info(
      { userId, tenantId },
      "User password changed",
    );
  }

  /**
   * Deletar usuário
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("user_not_found");
    }

    // Não permitir deletar super_admin
    if (existing.role === "super_admin") {
      throw new ValidationError("cannot_delete_super_admin");
    }

    try {
      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictError("user_has_related_records");
      }
      throw error;
    }

    this.logger.info(
      { userId: id, tenantId },
      "User deleted",
    );
  }

  /**
   * Resetar senha de um usuário (apenas admin pode fazer)
   * Retorna senha temporária que deve ser alterada no primeiro login
   */
  async resetPassword(id: string, tenantId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundError("user_not_found");
    }

    // Gerar senha temporária aleatória
    const tempPassword = this.generateTemporaryPassword();
    const passwordHash = await bcryptjs.hash(tempPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    this.logger.info(
      { userId: id, tenantId },
      "User password reset by admin",
    );

    return tempPassword;
  }

  /**
   * LGPD — Revogação de consentimento biométrico.
   *
   * Obrigatório (ver .claude/security.md):
   *   1. biometric_consents.is_active = false + revoked_at + revoked_by_id
   *   2. facial_embeddings do usuário deletados IMEDIATAMENTE
   *   3. users.facial_status = 'revoked' — warm cache e recognize filtram
   *      por facial_status='registered', então o usuário sai do reconhecimento
   */
  async revokeConsent(
    userId: string,
    tenantId: string,
    revokedById: string
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundError("user_not_found");

    await this.prisma.$transaction([
      this.prisma.biometricConsent.updateMany({
        where: { tenantId, userId, isActive: true },
        data: { isActive: false, revokedAt: new Date(), revokedById },
      }),
      this.prisma.facialEmbedding.deleteMany({
        where: { tenantId, userId },
      }),
      this.prisma.user.updateMany({
        where: { id: userId, tenantId },
        data: { facialStatus: "revoked" },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: revokedById,
          action: "biometric_consent_revoked",
          details: `Consentimento biométrico revogado para o usuário ${userId}; embeddings deletados`,
        },
      }),
    ]);

    // Invalida o embedding em cache na engine (não-fatal)
    engineInvalidateEmbedding(tenantId, userId).catch((error) => {
      this.logger.warn({ tenantId, userId, error }, "Failed to invalidate engine cache");
    });

    this.logger.info({ tenantId, userId, revokedById }, "Biometric consent revoked — embeddings deleted");
  }

  /**
   * LGPD — Exclusão definitiva dos dados biométricos do aluno.
   *
   * Decisão conservadora (MVP):
   *   - HARD DELETE: dados biométricos (facial_embeddings) e tokens de cadastro.
   *   - O cadastro do usuário (nome, e-mail, documento, etc.) NÃO é alterado —
   *     apenas a biometria é removida. Anonimizar/excluir o cadastro é uma
   *     ação separada (ver delete()).
   *   - biometric_consents são revogados mas MANTIDOS como evidência legal
   *     de que houve consentimento e de quando foi revogado.
   */
  async eraseUserData(
    userId: string,
    tenantId: string,
    requestedById: string
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundError("user_not_found");
    if (user.role === "super_admin") {
      throw new ValidationError("cannot_erase_super_admin");
    }

    await this.prisma.$transaction([
      this.prisma.facialEmbedding.deleteMany({ where: { tenantId, userId } }),
      this.prisma.enrollmentToken.deleteMany({ where: { tenantId, userId } }),
      this.prisma.biometricConsent.updateMany({
        where: { tenantId, userId, isActive: true },
        data: { isActive: false, revokedAt: new Date(), revokedById: requestedById },
      }),
      this.prisma.user.updateMany({
        where: { id: userId, tenantId },
        data: { facialStatus: "revoked" },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: requestedById,
          action: "user_data_erased",
          details: `Dados biométricos excluídos definitivamente para o usuário ${userId}`,
        },
      }),
    ]);

    engineInvalidateEmbedding(tenantId, userId).catch((error) => {
      this.logger.warn({ tenantId, userId, error }, "Failed to invalidate engine cache");
    });

    this.logger.info({ tenantId, userId, requestedById }, "User data erased (LGPD)");
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Select explícito para nunca expor passwordHash
   */
  private getUserSelect() {
    return {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      role: true,
      status: true,
      document: true,
      enrollmentCode: true,
      facialStatus: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  /**
   * Mapear usuário do banco para output DTO
   */
  private toOutput(user: any): UserOutput {
    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email ?? undefined,
      role: user.role,
      status: user.status,
      document: user.document ?? undefined,
      enrollmentCode: user.enrollmentCode ?? undefined,
      facialStatus: user.facialStatus,
      mustChangePassword: user.mustChangePassword ?? false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Gera senha temporária de 12 caracteres
   */
  private generateTemporaryPassword(): string {
    return Math.random().toString(36).slice(2, 14).toUpperCase();
  }
}

export const usersService = new UsersService();
