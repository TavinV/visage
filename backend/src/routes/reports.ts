/**
 * Reports Routes — Relatórios de frequência
 * Montado em /attendance/reports (ver .claude/api.md).
 */

import { Router, Request, Response, NextFunction } from "express";
import { reportsService } from "../services/reports.service";
import { authenticate, requireRole } from "../middleware/authenticate";

const router = Router();

/**
 * GET /attendance/reports/frequency?class_id&period_id
 * Frequência agregada por turma (admin/manager/teacher)
 */
router.get(
  "/frequency",
  authenticate,
  requireRole("admin", "manager", "teacher", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const classId = req.query.class_id as string | undefined;
      const periodId = req.query.period_id as string | undefined;

      if (!classId) {
        res.status(400).json({ error: "class_id é obrigatório", code: "validation_error" });
        return;
      }

      const result = await reportsService.frequencyByClass(tenantId, classId, periodId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /attendance/reports/student/:id
 * Histórico completo de presenças do aluno
 */
router.get(
  "/student/:id",
  authenticate,
  requireRole("admin", "manager", "teacher", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await reportsService.studentHistory(tenantId, req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /attendance/reports/student/:id/summary
 * Agregado por turma: { class_id, name, attended, absent, % }
 */
router.get(
  "/student/:id/summary",
  authenticate,
  requireRole("admin", "manager", "teacher", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await reportsService.studentSummary(tenantId, req.params.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
