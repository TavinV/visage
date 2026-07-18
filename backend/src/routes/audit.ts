/**
 * Audit Routes — Logs de reconhecimento e fraud frames do tenant
 *
 * GET /audit/recognition-logs           — filtrável por data, status, usuário
 * GET /audit/frames/:recognitionLogId   — stream JPEG (admin/manager, mesmo tenant)
 */

import { Router, Request, Response, NextFunction } from "express";
import { auditService } from "../services/audit.service";
import { authenticate, requireRole } from "../middleware/authenticate";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /audit/recognition-logs?date&status&user_id&device_id
 */
router.get(
  "/recognition-logs",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await auditService.listRecognitionLogs({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        date: req.query.date as string | undefined,
        status: req.query.status as string | undefined,
        userId: req.query.user_id as string | undefined,
        deviceId: req.query.device_id as string | undefined,
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
 * O path do arquivo nunca aparece na resposta.
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
