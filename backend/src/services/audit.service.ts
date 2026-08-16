/**
 * AuditService
 * Trilha de auditoria da plataforma + consulta de recognition_logs e acesso
 * restrito a fraud frames.
 *
 * Duas trilhas convivem aqui:
 *   - audit_logs      → o que as PESSOAS fizeram no console (esta é a nova)
 *   - recognition_logs → o que a ENGINE viu no totem (já existia)
 *
 * RULE (LGPD): fraud frames só são servidos após validar JWT + role
 * admin/manager + tenant_id do log == tenant_id do JWT. O path do arquivo
 * NUNCA é exposto na resposta — o Node serve o JPEG via stream.
 *
 * RULE (isolamento): admin/manager só enxergam a própria instituição. A rota
 * NUNCA passa tenantId vindo do cliente para admin/manager — sempre o do JWT.
 * `tenantId: null` nos params significa "visão global", e só o super_admin
 * chega nesse caminho.
 */

import fs from "fs";
import { Prisma } from "@prisma/client";
import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ForbiddenError } from "../utils/errors";
import { getRequestContext } from "../lib/requestContext";
import { describeEvent, AUDIT_CATEGORIES } from "../lib/auditEvents";
import { diffStates, snapshot } from "../utils/diff";

// ── DTOs — recognition logs (pré-existente) ──────────────────────────────────

export interface ListRecognitionLogsParams extends ListParams {
  tenantId?: string; // ausente apenas na visão global do super_admin
  date?: string; // YYYY-MM-DD
  status?: string;
  userId?: string;
  deviceId?: string;
}

export interface RecognitionLogOutput {
  id: string;
  tenantId: string;
  deviceId?: string;
  userId?: string;
  userName?: string;
  status: string;
  confidence?: number;
  livenessScore?: number;
  saturationMean?: number;
  processingMs?: number;
  fraudFrameExists: boolean;
  createdAt: Date;
}

// ── DTOs — trilha de auditoria ───────────────────────────────────────────────

/**
 * Entrada de um evento. Tudo que descreve o ATOR (quem, de onde, em qual
 * sessão) é preenchido pelo próprio serviço a partir do contexto da requisição
 * — o chamador só descreve O QUE aconteceu.
 */
export interface RecordAuditInput {
  action: string;
  /** Sobrepõe o tenant do contexto. Necessário em ações do super_admin sobre
   *  outra instituição e em eventos do totem, que não têm JWT de usuário. */
  tenantId?: string | null;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  changedFields?: string[];
  details?: string;
  metadata?: Record<string, unknown>;
  status?: "success" | "failure";
  /** Sobrepõe a severidade do catálogo (ex.: exclusão em massa). */
  severity?: "info" | "warning" | "critical";
  /** Ator explícito, para eventos sem requisição autenticada (login, totem). */
  actor?: {
    type?: "user" | "device" | "system" | "anonymous";
    userId?: string;
    name?: string;
    email?: string;
    role?: string;
    sessionId?: string;
    deviceId?: string;
  };
}

export interface AuditLogOutput {
  id: string;
  tenantId?: string;
  tenantName?: string;
  action: string;
  actionLabel: string;
  category: string;
  categoryLabel: string;
  severity: string;
  status: string;
  actorType: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  sessionId?: string;
  deviceId?: string;
  deviceLabel?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  changedFields: string[];
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  details?: string;
  metadata?: unknown;
  createdAt: Date;
}

export interface ListAuditLogsParams extends ListParams {
  /** undefined = visão global (só super_admin chega aqui). */
  tenantId?: string;
  action?: string;
  category?: string;
  severity?: string;
  status?: string;
  /** Filtra por quem executou. */
  actorId?: string;
  /** Filtra por quem/o que sofreu a ação. */
  targetId?: string;
  targetType?: string;
  /** Recorta a trilha de uma sessão de login específica. */
  sessionId?: string;
  from?: Date;
  to?: Date;
}

export interface AuthSessionOutput {
  id: string;
  tenantId: string;
  tenantName?: string;
  /** Ausente quando a conta foi excluída — o snapshot abaixo continua valendo. */
  userId?: string;
  userName: string;
  userEmail?: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  loginAt: Date;
  lastSeenAt: Date;
  endedAt?: Date;
  endReason?: string;
  /** true enquanto não houve logout nem expiração. */
  isActive: boolean;
  /** Duração da sessão em minutos (até agora, se ainda aberta). */
  durationMinutes: number;
  /** Quantos eventos a pessoa produziu nesta sessão. */
  eventCount: number;
}

export interface ListAuthSessionsParams extends ListParams {
  tenantId?: string;
  userId?: string;
  role?: string;
  /** true = só sessões abertas; false = só encerradas. */
  active?: boolean;
  from?: Date;
  to?: Date;
}

export interface UserActivityOutput {
  user: {
    id: string;
    name: string;
    email?: string;
    role: string;
    status: string;
  };
  totals: {
    events: number;
    sessions: number;
    lastLoginAt?: Date;
    lastActionAt?: Date;
  };
  /** Ranking do que a pessoa mais faz — "esse professor fez isso isso e isso". */
  byAction: Array<{ action: string; label: string; category: string; count: number }>;
  recentSessions: AuthSessionOutput[];
}

// ── Constantes ───────────────────────────────────────────────────────────────

/** Campos textuais varridos pela busca livre da trilha. */
const AUDIT_SEARCH_FIELDS = ["actorName", "actorEmail", "targetLabel", "details", "ipAddress"] as const;

// ── Serviço ───────────────────────────────────────────────────────────────────

class AuditService extends BaseService {
  // ═══════════════════════════════════════════════════════════════════════════
  // Gravação
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Grava um evento na trilha.
   *
   * Nunca lança e nunca é aguardado no caminho crítico: auditoria é
   * observabilidade, e uma falha ao registrar não pode desfazer a ação que o
   * usuário acabou de executar com sucesso. Falhas viram log de erro do
   * servidor, que é onde a operação vai perceber que a trilha parou de gravar.
   */
  record(input: RecordAuditInput): void {
    void this.writeRecord(input).catch((error) => {
      this.logger.error(
        { error, action: input.action, targetId: input.targetId },
        "Failed to write audit log",
      );
    });
  }

  /**
   * Versão aguardável, para quando o chamador precisa da linha gravada antes de
   * responder (raro — usada nos testes e no fluxo de exclusão de conta, onde a
   * cascata do banco pode apagar o ator logo em seguida).
   */
  async recordAndWait(input: RecordAuditInput): Promise<void> {
    try {
      await this.writeRecord(input);
    } catch (error) {
      this.logger.error({ error, action: input.action }, "Failed to write audit log");
    }
  }

  /**
   * Açúcar para eventos de mudança: calcula o diff e só grava se algo mudou de
   * fato. Um PATCH que reenvia os mesmos valores não polui a trilha.
   *
   * @param fields Restringe o diff aos campos de negócio, evitando ruído de
   *   updatedAt e colunas desnormalizadas.
   */
  recordChange(
    input: Omit<RecordAuditInput, "beforeState" | "afterState" | "changedFields"> & {
      before: Record<string, unknown> | null | undefined;
      after: Record<string, unknown> | null | undefined;
      fields?: readonly string[];
    },
  ): void {
    const { before, after, fields, ...rest } = input;
    const diff = diffStates(before, after, fields);
    if (diff.changedFields.length === 0) return;
    this.record({ ...rest, ...diff });
  }

  /** Snapshot completo — reexportado para os services montarem before/after. */
  snapshot = snapshot;

  private async writeRecord(input: RecordAuditInput): Promise<void> {
    const ctx = getRequestContext();
    const definition = describeEvent(input.action);
    const actor = input.actor ?? {};

    // Tenant explícito ganha do contexto (super_admin agindo sobre outro
    // tenant). `null` explícito força evento global (login falho sem cadastro).
    const tenantId =
      input.tenantId !== undefined ? input.tenantId : (ctx?.tenantId ?? null);

    const actorUserId = actor.userId ?? (ctx?.actorType === "user" ? ctx.userId : undefined);

    // O nome do ator não vem no JWT — resolvido aqui e congelado na linha, para
    // que a trilha continue legível se o usuário for renomeado ou excluído.
    let actorName = actor.name ?? ctx?.userName;
    if (!actorName && actorUserId) {
      actorName = await this.resolveUserName(actorUserId);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId ?? null,
        actorType: actor.type ?? ctx?.actorType ?? "system",
        actorName: actorName ?? null,
        actorEmail: actor.email ?? ctx?.userEmail ?? null,
        actorRole: actor.role ?? ctx?.userRole ?? null,
        sessionId: actor.sessionId ?? ctx?.sessionId ?? null,
        deviceId: actor.deviceId ?? ctx?.deviceId ?? null,

        action: input.action,
        category: definition.category,
        severity: input.severity ?? definition.severity,
        status: input.status ?? "success",

        targetType: input.targetType ?? definition.targetType ?? null,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel?.slice(0, 200) ?? null,

        beforeState: (input.beforeState ?? Prisma.DbNull) as Prisma.InputJsonValue,
        afterState: (input.afterState ?? Prisma.DbNull) as Prisma.InputJsonValue,
        changedFields: input.changedFields ?? [],

        ipAddress: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestMethod: ctx?.method ?? null,
        requestPath: ctx?.path ?? null,

        details: input.details ?? null,
        metadata: (input.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
  }

  /** Cache de nomes por requisição seria over-engineering: 1 SELECT por evento. */
  private async resolveUserName(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sessões de acesso
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Abre a sessão no login. O snapshot do usuário é congelado aqui para que a
   * lista de sessões continue legível mesmo depois de exclusões.
   */
  async openSession(user: {
    id: string;
    tenantId: string;
    name: string;
    email?: string | null;
    role: string;
  }): Promise<string> {
    const ctx = getRequestContext();
    const session = await this.prisma.authSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email ?? null,
        userRole: user.role,
        ipAddress: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
      select: { id: true },
    });
    return session.id;
  }

  /**
   * Fecha a sessão. Idempotente: fechar duas vezes (logout logo após expiração)
   * não sobrescreve o motivo original nem a hora do primeiro encerramento.
   */
  async closeSession(
    sessionId: string,
    reason: "logout" | "expired" | "revoked",
  ): Promise<void> {
    try {
      await this.prisma.authSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { endedAt: new Date(), endReason: reason, lastSeenAt: new Date() },
      });
    } catch (error) {
      this.logger.warn({ error, sessionId }, "Failed to close auth session");
    }
  }

  /** Marca atividade na sessão (chamado no refresh do access token). */
  async touchSession(sessionId: string): Promise<void> {
    try {
      await this.prisma.authSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { lastSeenAt: new Date() },
      });
    } catch (error) {
      this.logger.warn({ error, sessionId }, "Failed to touch auth session");
    }
  }

  async listSessions(
    params: ListAuthSessionsParams,
  ): Promise<PaginatedResult<AuthSessionOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);

    const searchOr = this.buildSearchFilter(params.search, [
      "userName",
      "userEmail",
      "ipAddress",
    ]);

    const where: Prisma.AuthSessionWhereInput = {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.userId && { userId: params.userId }),
      ...(params.role && { userRole: params.role }),
      ...(params.active !== undefined && { endedAt: params.active ? null : { not: null } }),
      ...((params.from || params.to) && {
        loginAt: { ...(params.from && { gte: params.from }), ...(params.to && { lte: params.to }) },
      }),
      ...(searchOr && { OR: searchOr }),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.authSession.findMany({
        where,
        take,
        skip,
        orderBy: { loginAt: "desc" },
        include: {
          tenant: { select: { name: true } },
          _count: { select: { auditLogs: true } },
        },
      }),
      this.prisma.authSession.count({ where }),
    ]);

    return this.buildPaginatedResult(
      sessions.map((s) => this.toSessionOutput(s)),
      total,
      page,
      limit,
    );
  }

  /**
   * Uma sessão e tudo que foi feito dentro dela, em ordem cronológica —
   * responde "este professor entrou às 14h02 e daí fez isso, isso e isso".
   *
   * @param tenantId undefined na visão do super_admin; qualquer outro valor
   *   precisa bater com o tenant da sessão, senão 403.
   */
  async getSessionDetail(
    sessionId: string,
    tenantId?: string,
  ): Promise<{ session: AuthSessionOutput; timeline: AuditLogOutput[] }> {
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: {
        tenant: { select: { name: true } },
        _count: { select: { auditLogs: true } },
      },
    });

    if (!session) throw new NotFoundError("Sessão não encontrada");
    if (tenantId && session.tenantId !== tenantId) {
      throw new ForbiddenError("Acesso negado a esta sessão");
    }

    // Sem paginação: uma sessão de console rende dezenas de eventos, não
    // milhares. O teto protege contra uma sessão anômala derrubar a tela.
    const logs = await this.prisma.auditLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        tenant: { select: { name: true } },
        device: { select: { label: true } },
      },
    });

    return {
      session: this.toSessionOutput(session),
      timeline: logs.map((log) => this.toAuditOutput(log)),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Consulta da trilha
  // ═══════════════════════════════════════════════════════════════════════════

  async listAuditLogs(
    params: ListAuditLogsParams,
  ): Promise<PaginatedResult<AuditLogOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: this.buildAuditWhere(params),
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: { select: { name: true } },
          device: { select: { label: true } },
        },
      }),
      this.prisma.auditLog.count({ where: this.buildAuditWhere(params) }),
    ]);

    return this.buildPaginatedResult(
      logs.map((log) => this.toAuditOutput(log)),
      total,
      page,
      limit,
    );
  }

  async getAuditLog(id: string, tenantId?: string): Promise<AuditLogOutput> {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        tenant: { select: { name: true } },
        device: { select: { label: true } },
      },
    });

    if (!log) throw new NotFoundError("Evento de auditoria não encontrado");
    if (tenantId && log.tenantId !== tenantId) {
      throw new ForbiddenError("Acesso negado a este evento");
    }

    return this.toAuditOutput(log);
  }

  /**
   * Perfil de atividade de uma pessoa: totais, o que mais faz e as últimas
   * sessões. Alimenta a visão "o que este usuário andou fazendo".
   */
  async getUserActivity(
    userId: string,
    tenantId?: string,
  ): Promise<UserActivityOutput> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, name: true, email: true, role: true, status: true },
    });

    if (!user) throw new NotFoundError("Usuário não encontrado");
    if (tenantId && user.tenantId !== tenantId) {
      throw new ForbiddenError("Acesso negado a este usuário");
    }

    const scope = { userId, ...(tenantId && { tenantId }) };

    const [eventCount, sessionCount, byAction, lastLog, lastSession, recentSessions] =
      await Promise.all([
        this.prisma.auditLog.count({ where: scope }),
        this.prisma.authSession.count({ where: scope }),
        this.prisma.auditLog.groupBy({
          by: ["action"],
          where: scope,
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
          take: 20,
        }),
        this.prisma.auditLog.findFirst({
          where: scope,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        this.prisma.authSession.findFirst({
          where: scope,
          orderBy: { loginAt: "desc" },
          select: { loginAt: true },
        }),
        this.prisma.authSession.findMany({
          where: scope,
          orderBy: { loginAt: "desc" },
          take: 10,
          include: {
            tenant: { select: { name: true } },
            _count: { select: { auditLogs: true } },
          },
        }),
      ]);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? undefined,
        role: user.role,
        status: user.status,
      },
      totals: {
        events: eventCount,
        sessions: sessionCount,
        lastLoginAt: lastSession?.loginAt,
        lastActionAt: lastLog?.createdAt,
      },
      byAction: byAction.map((row) => {
        const def = describeEvent(row.action);
        return {
          action: row.action,
          label: def.label,
          category: def.category,
          count: row._count.action,
        };
      }),
      recentSessions: recentSessions.map((s) => this.toSessionOutput(s)),
    };
  }

  /**
   * Atores que aparecem na trilha do período — alimenta o filtro "usuário" sem
   * listar a base inteira de usuários (que inclui milhares de alunos que nunca
   * logaram no console).
   */
  async listActors(
    tenantId?: string,
  ): Promise<Array<{ id: string; name: string; role?: string; eventCount: number }>> {
    const rows = await this.prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        ...(tenantId && { tenantId }),
        userId: { not: null },
      },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 100,
    });

    const ids = rows.map((r) => r.userId!).filter(Boolean);
    if (ids.length === 0) return [];

    // Nome atual quando o usuário ainda existe; snapshot da trilha quando não
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const fallbacks = await this.prisma.auditLog.findMany({
      where: { userId: { in: ids.filter((id) => !byId.has(id)) } },
      distinct: ["userId"],
      select: { userId: true, actorName: true, actorRole: true },
    });
    const fallbackById = new Map(fallbacks.map((f) => [f.userId!, f]));

    return rows.map((row) => {
      const id = row.userId!;
      const user = byId.get(id);
      const fallback = fallbackById.get(id);
      return {
        id,
        name: user?.name ?? fallback?.actorName ?? "Usuário removido",
        role: user?.role ?? fallback?.actorRole ?? undefined,
        eventCount: row._count.userId,
      };
    });
  }

  /**
   * Contagens por categoria e severidade no período — cabeçalho da tela de
   * auditoria, para o coordenador ver de relance se há algo crítico.
   */
  async getStats(params: ListAuditLogsParams): Promise<{
    total: number;
    byCategory: Array<{ category: string; label: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
    activeSessions: number;
  }> {
    const where = this.buildAuditWhere(params);

    const [total, byCategory, bySeverity, activeSessions] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ["category"],
        where,
        _count: { category: true },
        orderBy: { _count: { category: "desc" } },
      }),
      this.prisma.auditLog.groupBy({
        by: ["severity"],
        where,
        _count: { severity: true },
      }),
      this.prisma.authSession.count({
        where: { ...(params.tenantId && { tenantId: params.tenantId }), endedAt: null },
      }),
    ]);

    return {
      total,
      byCategory: byCategory.map((row) => ({
        category: row.category,
        label:
          AUDIT_CATEGORIES[row.category as keyof typeof AUDIT_CATEGORIES] ?? row.category,
        count: row._count.category,
      })),
      bySeverity: bySeverity.map((row) => ({
        severity: row.severity,
        count: row._count.severity,
      })),
      activeSessions,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Recognition logs (pré-existente)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lista recognition_logs. Com tenantId → visão do tenant;
   * sem tenantId → visão global (SOMENTE super_admin, validado na rota).
   */
  async listRecognitionLogs(
    params: ListRecognitionLogsParams,
  ): Promise<PaginatedResult<RecognitionLogOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);

    let dateFilter: { gte: Date; lt: Date } | undefined;
    if (params.date) {
      const dayStart = new Date(`${params.date}T00:00:00.000Z`);
      if (!Number.isNaN(dayStart.getTime())) {
        dateFilter = {
          gte: dayStart,
          lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
        };
      }
    }

    const where = {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.status && { status: params.status }),
      ...(params.userId && { userId: params.userId }),
      ...(params.deviceId && { deviceId: params.deviceId }),
      ...(dateFilter && { createdAt: dateFilter }),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.recognitionLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      this.prisma.recognitionLog.count({ where }),
    ]);

    return this.buildPaginatedResult(
      logs.map((log) => ({
        id: log.id,
        tenantId: log.tenantId,
        deviceId: log.deviceId ?? undefined,
        userId: log.userId ?? undefined,
        userName: log.user?.name ?? undefined,
        status: log.status,
        confidence: log.confidence ?? undefined,
        livenessScore: log.livenessScore ?? undefined,
        saturationMean: log.saturationMean ?? undefined,
        processingMs: log.processingMs ?? undefined,
        fraudFrameExists: log.fraudFrameExists,
        createdAt: log.createdAt,
        // fraudFramePath intencionalmente omitido — nunca expor o path
      })),
      total,
      page,
      limit,
    );
  }

  /**
   * Resolve o stream do fraud frame após validar tenant + existência.
   * A validação de role acontece na rota (requireRole admin/manager).
   */
  async getFraudFrameStream(
    tenantId: string,
    recognitionLogId: string,
  ): Promise<fs.ReadStream> {
    const log = await this.prisma.recognitionLog.findFirst({
      where: { id: recognitionLogId },
      select: {
        tenantId: true,
        fraudFramePath: true,
        fraudFrameExists: true,
        user: { select: { name: true } },
      },
    });

    if (!log) throw new NotFoundError("Recognition log not found");

    // Divergência de tenant → 403 (nunca revelar existência entre tenants)
    if (log.tenantId !== tenantId) {
      throw new ForbiddenError("Access denied to this fraud frame");
    }

    if (!log.fraudFrameExists || !log.fraudFramePath) {
      throw new NotFoundError("Fraud frame no longer available (expired or never saved)");
    }

    if (!fs.existsSync(log.fraudFramePath)) {
      // Arquivo removido fora do job — corrige o estado no banco
      await this.prisma.recognitionLog.updateMany({
        where: { id: recognitionLogId, tenantId },
        data: { fraudFrameExists: false, fraudFramePath: null },
      });
      throw new NotFoundError("Fraud frame no longer available (expired or never saved)");
    }

    // Imagem de rosto é dado pessoal sensível: quem abriu, quando e de qual IP
    // fica registrado (LGPD, art. 37 — registro das operações de tratamento).
    this.record({
      action: "data.fraud_frame_viewed",
      targetId: recognitionLogId,
      targetLabel: log.user?.name,
      details: "Visualização da foto capturada em tentativa de fraude",
    });

    return fs.createReadStream(log.fraudFramePath);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers privados
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAuditWhere(params: ListAuditLogsParams): Prisma.AuditLogWhereInput {
    const searchOr = this.buildSearchFilter(params.search, AUDIT_SEARCH_FIELDS);

    return {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.action && { action: params.action }),
      ...(params.category && { category: params.category }),
      ...(params.severity && { severity: params.severity }),
      ...(params.status && { status: params.status }),
      ...(params.actorId && { userId: params.actorId }),
      ...(params.targetId && { targetId: params.targetId }),
      ...(params.targetType && { targetType: params.targetType }),
      ...(params.sessionId && { sessionId: params.sessionId }),
      ...((params.from || params.to) && {
        createdAt: {
          ...(params.from && { gte: params.from }),
          ...(params.to && { lte: params.to }),
        },
      }),
      ...(searchOr && { OR: searchOr }),
    };
  }

  private toAuditOutput(log: {
    id: string;
    tenantId: string | null;
    tenant?: { name: string } | null;
    action: string;
    category: string;
    severity: string;
    status: string;
    actorType: string;
    userId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    sessionId: string | null;
    deviceId: string | null;
    device?: { label: string | null } | null;
    targetType: string | null;
    targetId: string | null;
    targetLabel: string | null;
    changedFields: string[];
    beforeState: unknown;
    afterState: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    requestMethod: string | null;
    requestPath: string | null;
    details: string | null;
    metadata: unknown;
    createdAt: Date;
  }): AuditLogOutput {
    const definition = describeEvent(log.action);

    return {
      id: log.id,
      tenantId: log.tenantId ?? undefined,
      tenantName: log.tenant?.name ?? undefined,
      action: log.action,
      actionLabel: definition.label,
      category: log.category,
      categoryLabel:
        AUDIT_CATEGORIES[log.category as keyof typeof AUDIT_CATEGORIES] ?? log.category,
      severity: log.severity,
      status: log.status,
      actorType: log.actorType,
      actorId: log.userId ?? undefined,
      actorName: log.actorName ?? undefined,
      actorEmail: log.actorEmail ?? undefined,
      actorRole: log.actorRole ?? undefined,
      sessionId: log.sessionId ?? undefined,
      deviceId: log.deviceId ?? undefined,
      deviceLabel: log.device?.label ?? undefined,
      targetType: log.targetType ?? undefined,
      targetId: log.targetId ?? undefined,
      targetLabel: log.targetLabel ?? undefined,
      changedFields: log.changedFields,
      beforeState: log.beforeState ?? undefined,
      afterState: log.afterState ?? undefined,
      ipAddress: log.ipAddress ?? undefined,
      userAgent: log.userAgent ?? undefined,
      requestMethod: log.requestMethod ?? undefined,
      requestPath: log.requestPath ?? undefined,
      details: log.details ?? undefined,
      metadata: log.metadata ?? undefined,
      createdAt: log.createdAt,
    };
  }

  private toSessionOutput(session: {
    id: string;
    tenantId: string;
    tenant?: { name: string } | null;
    userId: string | null;
    userName: string;
    userEmail: string | null;
    userRole: string;
    ipAddress: string | null;
    userAgent: string | null;
    loginAt: Date;
    lastSeenAt: Date;
    endedAt: Date | null;
    endReason: string | null;
    _count?: { auditLogs: number };
  }): AuthSessionOutput {
    // Sessão aberta é medida até agora; encerrada, até o encerramento
    const end = session.endedAt ?? new Date();
    const durationMinutes = Math.max(
      0,
      Math.round((end.getTime() - session.loginAt.getTime()) / 60000),
    );

    return {
      id: session.id,
      tenantId: session.tenantId,
      tenantName: session.tenant?.name ?? undefined,
      userId: session.userId ?? undefined,
      userName: session.userName,
      userEmail: session.userEmail ?? undefined,
      userRole: session.userRole,
      ipAddress: session.ipAddress ?? undefined,
      userAgent: session.userAgent ?? undefined,
      loginAt: session.loginAt,
      lastSeenAt: session.lastSeenAt,
      endedAt: session.endedAt ?? undefined,
      endReason: session.endReason ?? undefined,
      isActive: session.endedAt === null,
      durationMinutes,
      eventCount: session._count?.auditLogs ?? 0,
    };
  }
}

export const auditService = new AuditService();
