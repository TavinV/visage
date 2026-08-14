/**
 * Reports Routes — Relatórios de frequência
 * Montado em /attendance/reports (ver .claude/api.md).
 */

import { Router, Request, Response, NextFunction } from "express";
import { reportsService } from "../services/reports.service";
import { authenticate, requireRole } from "../middleware/authenticate";

const router = Router();

/**
 * GET /attendance/reports/frequency?class_subject_id | ?class_id
 *
 * Com class_subject_id devolve a frequência daquela disciplina; com class_id
 * devolve uma entrada por disciplina da turma — que é como o professor abre
 * a turma dele e vê todo mundo de uma vez.
 */
router.get(
  "/frequency",
  authenticate,
  requireRole("admin", "manager", "teacher", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const classSubjectId = req.query.class_subject_id as string | undefined;
      const classId = req.query.class_id as string | undefined;

      if (classSubjectId) {
        const result = await reportsService.frequencyByClassSubject(tenantId, classSubjectId);
        res.json({ data: result });
        return;
      }

      if (!classId) {
        res.status(400).json({
          error: "Informe class_subject_id ou class_id",
          code: "validation_error",
        });
        return;
      }

      const result = await reportsService.frequencyByClass(tenantId, classId);
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
