/**
 * Students Routes — Gestão de tokens de cadastro biométrico (QR Code)
 *
 * O token bruto só existe na resposta do POST — apenas o SHA-256 é
 * persistido em enrollment_tokens.
 */

import { Router, Request, Response, NextFunction } from "express";
import { enrollmentService } from "../services/enrollment.service";
import { authenticate, requireRole } from "../middleware/authenticate";

const router = Router();

/**
 * POST /students/:id/enrollment-token
 * Gera QR Code token de uso único (admin/manager)
 */
router.post(
  "/:id/enrollment-token",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant!;
      const result = await enrollmentService.generateToken(tenantId, req.params.id, userId);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /students/:id/enrollment-token
 * Status do token atual do aluno (admin/manager)
 */
router.get(
  "/:id/enrollment-token",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await enrollmentService.getTokenStatus(tenantId, req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /students/:id/enrollment-token
 * Revoga token pendente do aluno (admin/manager)
 */
router.delete(
  "/:id/enrollment-token",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await enrollmentService.revokeToken(tenantId, req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
