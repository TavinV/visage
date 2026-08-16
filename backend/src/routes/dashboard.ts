/**
 * Dashboard Routes — números consolidados da tela inicial.
 *
 * GET /dashboard/overview?days=14
 */

import { Router, Request, Response, NextFunction } from "express";
import { dashboardService } from "../services/dashboard.service";
import { authenticate, requireRole } from "../middleware/authenticate";

const router = Router();

router.get(
  "/overview",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const days = req.query.days ? Number(req.query.days) : 14;
      const result = await dashboardService.overview(tenantId, days);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
