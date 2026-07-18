/**
 * Admin Routes — visão global (SOMENTE super_admin)
 *
 * GET  /admin/recognition-logs — logs globais, sem filtro de tenant
 * GET  /admin/health           — proxy para GET /health da engine Python
 * POST /admin/rotate-password  — rotação segura da senha do super_admin
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { auditService } from "../services/audit.service";
import { adminService } from "../services/admin.service";
import { engineHealth } from "../lib/faceEngine";
import { authenticate, requireSuperAdmin } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

const RotatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(100),
});

type RotatePasswordRequest = z.infer<typeof RotatePasswordSchema>;

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
