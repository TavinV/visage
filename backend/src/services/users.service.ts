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
import { normalizeDocument, isValidCpf } from "../utils/document";
import {
  resolveIdentification,
  registersCpf,
  registersEnrollmentCode,
  type IdentificationPolicy,
} from "../utils/identification";
import { engineInvalidateEmbedding } from "../lib/faceEngine";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";
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
  /** Tem foto de perfil enviada — alunos nunca têm. */
  hasPhoto: boolean;
  photoUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListUsersParams extends ListParams {
  tenantId: string; // obrigatório — isolamento tenant
  role?: string[]; // filtro opcional por cargo(s)
  status?: string[]; // filtro opcional por status(es)
  facialStatus?: string[]; // filtro opcional por situação da biometria
  createdFrom?: Date;
  createdTo?: Date;
  /**
   * Inclui desativados na listagem. Desligar um usuário é o "excluir" do
   * produto (o registro fica para não órfãos de presença), então por padrão
   * ele some da lista — quem quer auditar liga o filtro na tela.
   */
  includeInactive?: boolean;
}

/**
 * Campos do cadastro que a trilha de auditoria acompanha. Deixa de fora hash de
 * senha (redigido de qualquer forma) e carimbos automáticos, que só gerariam
 * ruído no diff de cada edição.
 */
const AUDITED_USER_FIELDS = [
  "name",
  "email",
  "role",
  "status",
  "document",
  "enrollmentCode",
  "facialStatus",
] as const;

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
      "enrollmentCode",
    ]);
    // document é gravado só com dígitos (sem máscara) — um CPF digitado com
    // pontuação na busca nunca bateria com "contains" sem essa normalização.
    const documentDigits = params.search?.replace(/\D/g, "") ?? "";
    const combinedOr = [
      ...(searchOr ?? []),
      ...(documentDigits ? [{ document: { contains: documentDigits } }] : []),
    ];

    const where = {
      tenantId: params.tenantId,
      ...(params.role && params.role.length > 0 && { role: { in: params.role } }),
      // Status explícito manda: pedir "inativos" não pode esbarrar no filtro
      // padrão que justamente os esconde
      ...(params.status && params.status.length > 0
        ? { status: { in: params.status } }
        : !params.includeInactive && { status: { not: "inactive" } }),
      ...(params.facialStatus &&
        params.facialStatus.length > 0 && { facialStatus: { in: params.facialStatus } }),
      ...this.buildDateRange("createdAt", params.createdFrom, params.createdTo),
      ...(combinedOr.length > 0 && { OR: combinedOr }),
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
    // Validar email único no sistema inteiro (não só no tenant)
    if (input.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: input.email },
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

    const policy = await this.loadIdentificationPolicy(input.tenantId);
    const normalizedDoc = this.normalizeCpf(input.document, policy);
    // Código interno só faz sentido para alunos
    const enrollmentCode =
      input.role === "student" ? input.enrollmentCode?.trim() || null : null;

    this.assertStudentIdentifiers(input.role, policy, normalizedDoc, enrollmentCode);

    // Validar CPF único no tenant quando fornecido
    if (normalizedDoc) {
      const docExists = await this.prisma.user.findFirst({
        where: { tenantId: input.tenantId, document: normalizedDoc },
      });
      if (docExists) throw new ConflictError("document_already_exists");
    }

    await this.assertEnrollmentCodeAvailable(input.tenantId, enrollmentCode);

    const user = await this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        email: input.email || null,
        role: input.role,
        passwordHash,
        mustChangePassword: temporaryPassword !== undefined,
        document: normalizedDoc,
        enrollmentCode,
        status: "active",
      },
      select: this.getUserSelect(),
    });

    auditService.record({
      action: input.role === "student" ? "student.created" : "user.created",
      tenantId: input.tenantId,
      targetId: user.id,
      targetLabel: user.name,
      afterState: snapshot(user, AUDITED_USER_FIELDS),
      details:
        input.role === "student"
          ? `Aluno ${user.name} cadastrado`
          : `Usuário ${user.name} criado com perfil ${input.role}`,
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

    // Se email está sendo atualizado, validar unicidade no sistema inteiro
    if (input.email && input.email !== existing.email) {
      const duplicate = await this.prisma.user.findFirst({
        where: { email: input.email, id: { not: id } },
      });

      if (duplicate) {
        throw new ConflictError("email_already_exists");
      }
    }

    const policy = await this.loadIdentificationPolicy(tenantId);
    const role = input.role ?? existing.role;

    // Valores resultantes da edição — campos ausentes mantêm o que já existe
    const document =
      input.document !== undefined
        ? this.normalizeCpf(input.document ?? undefined, policy)
        : existing.document;
    const enrollmentCode =
      input.enrollmentCode !== undefined
        ? input.enrollmentCode?.trim() || null
        : existing.enrollmentCode;

    // Numa edição, só cobra o identificador que está sendo mexido (ou quando o
    // usuário vira aluno agora): um PATCH de status não pode falhar por causa
    // de um aluno antigo importado sem CPF
    this.assertStudentIdentifiers(role, policy, document, enrollmentCode, {
      document: input.document !== undefined || existing.role !== "student",
      enrollmentCode: input.enrollmentCode !== undefined || existing.role !== "student",
    });

    if (document && document !== existing.document) {
      const duplicate = await this.prisma.user.findFirst({
        where: { tenantId, document, id: { not: id } },
      });
      if (duplicate) throw new ConflictError("document_already_exists");
    }

    if (enrollmentCode !== existing.enrollmentCode) {
      await this.assertEnrollmentCodeAvailable(tenantId, enrollmentCode, id);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.email && { email: input.email }),
        ...(input.role && { role: input.role }),
        ...(input.document !== undefined && { document }),
        ...(input.enrollmentCode !== undefined && { enrollmentCode }),
        ...(input.status && { status: input.status }),
      },
      select: this.getUserSelect(),
    });

    auditService.recordChange({
      action: user.role === "student" ? "student.updated" : "user.updated",
      tenantId,
      targetId: id,
      targetLabel: user.name,
      before: existing,
      after: user,
      fields: AUDITED_USER_FIELDS,
      details: `Cadastro de ${user.name} editado`,
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
      select: { id: true, name: true, passwordHash: true },
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

    auditService.record({
      action: "auth.password_changed",
      tenantId,
      targetId: userId,
      targetLabel: user.name,
      details: "Senha alterada pelo próprio usuário",
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

    // beforeState guarda o cadastro inteiro: depois do DELETE, esta linha da
    // trilha é o único lugar onde ainda existe registro de quem era a pessoa.
    auditService.record({
      action: existing.role === "student" ? "student.deleted" : "user.deleted",
      tenantId,
      targetId: id,
      targetLabel: existing.name,
      beforeState: snapshot(existing, AUDITED_USER_FIELDS),
      details: `${existing.role === "student" ? "Aluno" : "Usuário"} ${existing.name} excluído definitivamente`,
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
      data: { passwordHash, mustChangePassword: true },
    });

    auditService.record({
      action: "user.password_reset",
      tenantId,
      targetId: id,
      targetLabel: user.name,
      details: `Senha de ${user.name} redefinida por um administrador; troca obrigatória no próximo acesso`,
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
      select: { id: true, name: true, facialStatus: true },
    });
    if (!user) throw new NotFoundError("user_not_found");

    const [, deletedEmbeddings] = await this.prisma.$transaction([
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
    ]);

    auditService.record({
      action: "consent.revoked",
      tenantId,
      targetId: userId,
      targetLabel: user.name,
      beforeState: { facialStatus: user.facialStatus, biometricsStored: true },
      afterState: { facialStatus: "revoked", biometricsStored: false },
      changedFields: ["facialStatus", "biometricsStored"],
      details: `Consentimento biométrico de ${user.name} revogado; dados faciais apagados`,
      metadata: { embeddingsDeleted: deletedEmbeddings.count },
    });

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
      select: { id: true, name: true, role: true, facialStatus: true },
    });
    if (!user) throw new NotFoundError("user_not_found");
    if (user.role === "super_admin") {
      throw new ValidationError("cannot_erase_super_admin");
    }

    const [deletedEmbeddings, deletedTokens] = await this.prisma.$transaction([
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
    ]);

    auditService.record({
      action: "data.erased",
      tenantId,
      targetId: userId,
      targetLabel: user.name,
      beforeState: { facialStatus: user.facialStatus, biometricsStored: true },
      afterState: { facialStatus: "revoked", biometricsStored: false },
      changedFields: ["facialStatus", "biometricsStored"],
      details: `Dados biométricos de ${user.name} excluídos definitivamente (direito de eliminação, LGPD art. 18)`,
      metadata: {
        embeddingsDeleted: deletedEmbeddings.count,
        enrollmentTokensDeleted: deletedTokens.count,
        // O cadastro e os consentimentos ficam: são a prova legal de que houve
        // consentimento e de quando ele foi revogado
        registrationPreserved: true,
      },
    });

    engineInvalidateEmbedding(tenantId, userId).catch((error) => {
      this.logger.warn({ tenantId, userId, error }, "Failed to invalidate engine cache");
    });

    this.logger.info({ tenantId, userId, requestedById }, "User data erased (LGPD)");
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /** Política de identificação do tenant (o que registrar e como validar). */
  private async loadIdentificationPolicy(tenantId: string): Promise<IdentificationPolicy> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        studentIdentification: true,
        totemIdentification: true,
        validateCpf: true,
      },
    });
    return resolveIdentification(settings);
  }

  /**
   * Normaliza e valida o CPF conforme a política do tenant.
   *
   * O formato (11 dígitos) é sempre exigido — a coluna tem 11 caracteres e o
   * totem casa o documento por dígitos. Já os dígitos verificadores só são
   * conferidos com `validateCpf` ligado: instituições que testam a plataforma
   * sem coletar CPF real dos alunos usam números CPF-shaped mas inválidos
   * (ex.: 111.222.333-44) até migrarem para dados reais.
   */
  private normalizeCpf(
    document: string | undefined,
    policy: IdentificationPolicy
  ): string | null {
    if (!document?.trim()) return null;

    const normalized = normalizeDocument(document.trim());
    if (!/^\d{11}$/.test(normalized)) {
      throw new ValidationError("invalid_cpf_format");
    }
    if (policy.validateCpf && !isValidCpf(normalized)) {
      throw new ValidationError("invalid_cpf");
    }
    return normalized;
  }

  /**
   * Exige do aluno os identificadores que a instituição configurou. Sem isso,
   * um aluno cadastrado sem o identificador do totem nunca conseguiria fazer
   * a biometria.
   */
  private assertStudentIdentifiers(
    role: string,
    policy: IdentificationPolicy,
    document: string | null,
    enrollmentCode: string | null,
    /** Quais campos devem ser cobrados nesta operação (tudo, por padrão). */
    check: { document: boolean; enrollmentCode: boolean } = {
      document: true,
      enrollmentCode: true,
    }
  ): void {
    if (role !== "student") return;

    if (check.document && registersCpf(policy.studentIdentification) && !document) {
      throw new ValidationError("document_required");
    }
    if (
      check.enrollmentCode &&
      registersEnrollmentCode(policy.studentIdentification) &&
      !enrollmentCode
    ) {
      throw new ValidationError("enrollment_code_required");
    }
  }

  /**
   * Matrícula duplicada tornaria a identificação no totem ambígua — barrada no
   * cadastro (o banco não tem unique: bases importadas costumam chegar sujas).
   */
  private async assertEnrollmentCodeAvailable(
    tenantId: string,
    enrollmentCode: string | null,
    ignoreUserId?: string
  ): Promise<void> {
    if (!enrollmentCode) return;

    const duplicate = await this.prisma.user.findFirst({
      where: {
        tenantId,
        // Sem diferenciar caixa: o totem casa "2026a12" com "2026A12", então
        // deixar os dois cadastrados criaria uma ambiguidade na identificação
        enrollmentCode: { equals: enrollmentCode, mode: "insensitive" },
        ...(ignoreUserId && { id: { not: ignoreUserId } }),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError("enrollment_code_already_exists");
  }

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
      photoUpdatedAt: true,
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
      // O painel usa isto para decidir entre buscar GET /users/:id/photo e
      // desenhar as iniciais; o timestamp também quebra o cache do <img>
      hasPhoto: user.photoUpdatedAt != null,
      photoUpdatedAt: user.photoUpdatedAt ?? undefined,
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
