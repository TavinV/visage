/**
 * Admin Routes — visão global (SOMENTE super_admin)
 *
 * GET  /admin/overview            — números consolidados da plataforma inteira
 * GET  /admin/recognition-logs    — logs globais, sem filtro de tenant
 * GET  /admin/audit/logs          — trilha de auditoria de TODAS as instituições
 * GET  /admin/audit/logs/:id      — evento completo, de qualquer instituição
 * GET  /admin/audit/stats         — contagens globais
 * GET  /admin/audit/actors        — atores de todas as instituições
 * GET  /admin/audit/sessions      — sessões de login de todas as instituições
 * GET  /admin/audit/sessions/:id  — sessão + linha do tempo
 * GET  /admin/health              — proxy para GET /health da engine Python
 * POST /admin/rotate-password     — rotação segura da senha do super_admin
 *
 * RULE: aqui `tenant_id` é um FILTRO opcional, não isolamento. É a única parte
 * da API onde a ausência de tenant significa "todas as instituições" — por isso
 * cada rota passa por requireSuperAdmin.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { auditService } from "../services/audit.service";
import { adminService } from "../services/admin.service";
import { platformService } from "../services/platform.service";
import { engineHealth } from "../lib/faceEngine";
import { authenticate, requireSuperAdmin } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { auditFiltersFromQuery, parseDate } from "./audit";
import { listEventCatalog, AUDIT_CATEGORIES } from "../lib/auditEvents";

const router = Router();

const RotatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(100),
});

type RotatePasswordRequest = z.infer<typeof RotatePasswordSchema>;

/**
 * GET /admin/overview?days=14
 * Base de clientes, receita recorrente e uso da engine em toda a plataforma.
 */
router.get(
  "/overview",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = req.query.days ? Number(req.query.days) : 14;
      const result = await platformService.overview(days);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/recognition-logs?date&status&tenant_id
 * Logs globais de reconhecimento — única visão sem filtro obrigatório de tenant.
 */
router.get(
  "/recognition-logs",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.listRecognitionLogs({
        // tenant_id aqui é um FILTRO OPCIONAL do super_admin, não isolamento
        tenantId: req.query.tenant_id as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        date: req.query.date as string | undefined,
        status: req.query.status as string | undefined,
        userId: req.query.user_id as string | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ── Trilha de auditoria global ───────────────────────────────────────────────

/**
 * GET /admin/audit/logs?tenant_id&action&category&severity&actor_id&from&to&search
 * Sem tenant_id, devolve a trilha de todas as instituições — inclusive os
 * eventos sem instituição (login falho de e-mail que não existe).
 */
router.get(
  "/audit/logs",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.listAuditLogs({
        ...auditFiltersFromQuery(req.query),
        tenantId: (req.query.tenant_id as string | undefined) || undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/audit/stats?tenant_id&from&to
 */
router.get(
  "/audit/stats",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.getStats({
        ...auditFiltersFromQuery(req.query),
        tenantId: (req.query.tenant_id as string | undefined) || undefined,
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/audit/events — mesmo catálogo servido ao tenant.
 */
router.get(
  "/audit/events",
  authenticate,
  requireSuperAdmin,
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
 * GET /admin/audit/actors?tenant_id
 */
router.get(
  "/audit/actors",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.listActors(
        (req.query.tenant_id as string | undefined) || undefined
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/audit/logs/:id — evento completo, sem restrição de instituição.
 */
router.get(
  "/audit/logs/:id",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      // Sem tenantId: o super_admin lê o evento de qualquer instituição
      const result = await auditService.getAuditLog(req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/audit/sessions?tenant_id&user_id&role&active&from&to
 */
router.get(
  "/audit/sessions",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.listSessions({
        tenantId: (req.query.tenant_id as string | undefined) || undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        userId: (req.query.user_id as string | undefined) || undefined,
        role: (req.query.role as string | undefined) || undefined,
        active:
          req.query.active === undefined ? undefined : req.query.active === "true",
        search: (req.query.search as string | undefined) || undefined,
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
 * GET /admin/audit/sessions/:id — sessão + linha do tempo, de qualquer tenant.
 */
router.get(
  "/audit/sessions/:id",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const result = await auditService.getSessionDetail(req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/health
 * Proxy para a saúde da engine Python (modelos carregados).
 */
router.get(
  "/health",
  authenticate,
  requireSuperAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await engineHealth();
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/rotate-password
 * Rotação da senha do super_admin autenticado (exige senha atual).
 */
router.post(
  "/rotate-password",
  authenticate,
  requireSuperAdmin,
  validate(RotatePasswordSchema),
  async (req: Request<{}, {}, RotatePasswordRequest>, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.tenant!;
      await adminService.rotateSuperAdminPassword(
        userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      res.json({ data: { rotated: true } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
