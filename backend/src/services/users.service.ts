/**
 * UsersService
 * Gerenciamento de usuários — criar, listar, atualizar, deletar e alterar senha.
 * Estende BaseService para acesso centralizado ao prisma e logger.
 *
 * RULE: Todo usuário é isolado por tenantId.
 * Admin pode gerenciar usuários do seu próprio tenant.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors";
import { normalizeDocument, isValidCpf } from "../utils/cpfQr";
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
  async create(input: CreateUserInput): Promise<UserOutput> {
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

    // Hash de senha se fornecida
    let passwordHash: string | null = null;
    if (input.password) {
      if (input.password.length < 8) {
        throw new ValidationError("password_too_short");
      }
      passwordHash = await bcryptjs.hash(input.password, 12);
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
        document: normalizedDoc,
        enrollmentCode: input.enrollmentCode || null,
        status: "active",
      },
      select: this.getUserSelect(),
    });

    this.logger.info(
      { userId: user.id, tenantId: input.tenantId, role: input.role },
      "User created",
    );

    return this.toOutput(user);
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
      data: { passwordHash: newPasswordHash },
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

    await this.prisma.user.delete({
      where: { id },
    });

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
      data: { passwordHash },
    });

    this.logger.info(
      { userId: id, tenantId },
      "User password reset by admin",
    );

    return tempPassword;
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
