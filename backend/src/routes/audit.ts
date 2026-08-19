/**
 * Audit Routes — trilha de auditoria da instituição
 *
 * Trilha de ações (quem fez o quê no console):
 *   GET /audit/logs                   — filtrável por evento, categoria, ator, alvo, período
 *   GET /audit/logs/:id               — evento completo, com estado anterior e novo
 *   GET /audit/stats                  — contagens por categoria e severidade
 *   GET /audit/events                 — catálogo de eventos (monta o filtro no painel)
 *   GET /audit/actors                 — quem aparece na trilha (monta o filtro no painel)
 *   GET /audit/sessions               — sessões de login
 *   GET /audit/sessions/:id           — sessão + linha do tempo do que a pessoa fez nela
 *   GET /audit/users/:userId/activity — perfil de atividade de um usuário
 *
 * Reconhecimento facial (trilha da engine, pré-existente):
 *   GET /audit/recognition-logs           — filtrável por data, status, usuário
 *   GET /audit/frames/:recognitionLogId   — stream JPEG (admin/manager, mesmo tenant)
 *
 * RULE (isolamento): TODAS as rotas daqui derivam o tenant do JWT — nunca da
 * query. Admin e coordenador (manager) enxergam exclusivamente a própria
 * instituição. A visão global de todas as instituições existe apenas em
 * /admin/audit/*, atrás de requireSuperAdmin.
 */

import { Router, Request, Response, NextFunction } from "express";
import { auditService } from "../services/audit.service";
import { authenticate, requireRole } from "../middleware/authenticate";
import { listEventCatalog, AUDIT_CATEGORIES } from "../lib/auditEvents";
import { logger } from "../lib/logger";
import { strList, parseDate } from "../utils/query";

const router = Router();

/**
 * Coordenador e administrador leem a trilha; professor e aluno, não.
 * O super_admin também passa aqui — vê a instituição do próprio JWT, e usa
 * /admin/audit/logs quando quer a visão de todas.
 */
const canReadAudit = requireRole("admin", "manager", "super_admin");

// ── Helpers de query ─────────────────────────────────────────────────────────

export { parseDate };

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** Filtros da trilha compartilhados entre a rota do tenant e a do super_admin. */
export function auditFiltersFromQuery(query: Request["query"]) {
  return {
    page: query.page ? Number(query.page) : undefined,
    limit: query.limit ? Number(query.limit) : undefined,
    action: strList(query.action),
    category: strList(query.category),
    severity: str(query.severity),
    status: str(query.status),
    actorId: str(query.actor_id),
    targetId: str(query.target_id),
    targetType: str(query.target_type),
    sessionId: str(query.session_id),
    search: str(query.search),
    from: parseDate(query.from),
    to: parseDate(query.to, true),
  };
}

// ── Trilha de ações ──────────────────────────────────────────────────────────

/**
 * GET /audit/logs
 * Eventos da instituição do JWT, do mais recente para o mais antigo.
 */
router.get(
  "/logs",
  authenticate,
  canReadAudit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.listAuditLogs({
        ...auditFiltersFromQuery(req.query),
        tenantId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/stats
 * Cabeçalho da tela: total, quebra por categoria/severidade e sessões abertas.
 */
router.get(
  "/stats",
  authenticate,
  canReadAudit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.getStats({
        ...auditFiltersFromQuery(req.query),
        tenantId,
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/events
 * Catálogo estático de eventos e categorias. O painel usa para montar os
 * filtros e traduzir as linhas sem duplicar a tabela no frontend.
 */
router.get(
  "/events",
  authenticate,
  canReadAudit,
  (_req: Request, res: Response) => {
    res.json({
      data: {
        events: listEventCatalog(),
        categories: Object.entries(AUDIT_CATEGORIES).map(([value, label]) => ({
          value,
          label,
        })),
      },
    });
  }
);

/**
 * GET /audit/actors
 * Quem produziu eventos nesta instituição — popula o filtro "usuário" sem
 * carregar a base inteira de alunos.
 */
router.get(
  "/actors",
  authenticate,
  canReadAudit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.listActors(tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/logs/:id
 * Evento completo, incluindo beforeState/afterState.
 */
router.get(
  "/logs/:id",
  authenticate,
  canReadAudit,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.getAuditLog(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

// ── Sessões de acesso ────────────────────────────────────────────────────────

/**
 * GET /audit/sessions?user_id&role&active&from&to
 * Logins da instituição: quem entrou, quando, de qual IP e por quanto tempo.
 */
router.get(
  "/sessions",
  authenticate,
  canReadAudit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.listSessions({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        userId: str(req.query.user_id),
        role: str(req.query.role),
        active:
          req.query.active === undefined ? undefined : req.query.active === "true",
        search: str(req.query.search),
        from: parseDate(req.query.from),
        to: parseDate(req.query.to, true),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/sessions/:id
 * A sessão e a linha do tempo do que a pessoa fez enquanto esteve logada.
 */
router.get(
  "/sessions/:id",
  authenticate,
  canReadAudit,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.getSessionDetail(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/users/:userId/activity
 * Retrato do que um usuário faz: totais, ações mais frequentes e últimos logins.
 */
router.get(
  "/users/:userId/activity",
  authenticate,
  canReadAudit,
  async (req: Request<{ userId: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await auditService.getUserActivity(req.params.userId, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

// ── Reconhecimento facial ────────────────────────────────────────────────────

/**
 * GET /audit/recognition-logs?date&status&user_id&device_id
 */
router.get(
  "/recognition-logs",
  authenticate,
  canReadAudit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await auditService.listRecognitionLogs({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        date: str(req.query.date),
        status: str(req.query.status),
        userId: str(req.query.user_id),
        deviceId: str(req.query.device_id),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /audit/frames/:recognitionLogId
 * Stream do JPEG do fraud frame. Validações obrigatórias:
 *   1. JWT válido (authenticate)
 *   2. role IN ('admin','manager') — requireRole
 *   3. tenant_id do JWT == tenant_id do log — auditService (403 se divergente)
 * O path do arquivo nunca aparece na resposta. O acesso em si vira evento de
 * auditoria ('data.fraud_frame_viewed'), gravado dentro do service.
 */
router.get(
  "/frames/:recognitionLogId",
  authenticate,
  requireRole("admin", "manager"),
  async (req: Request<{ recognitionLogId: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const stream = await auditService.getFraudFrameStream(
        tenantId,
        req.params.recognitionLogId
      );

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, no-store");

      stream.on("error", (error) => {
        logger.error({ error, recognitionLogId: req.params.recognitionLogId }, "Fraud frame stream error");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to read fraud frame", code: "internal_error" });
        } else {
          res.end();
        }
      });

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
