/**
 * Academic Periods Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { academicPeriodsService } from "../services/academic-periods.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreatePeriodSchema = z.object({
  name: z.string().min(1).max(100),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const UpdatePeriodSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

type CreatePeriodRequest = z.infer<typeof CreatePeriodSchema>;
type UpdatePeriodRequest = z.infer<typeof UpdatePeriodSchema>;

/**
 * GET /academic-periods
 * Lista períodos acadêmicos do tenant (admin only)
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await academicPeriodsService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        isActive: req.query.isActive ? req.query.isActive === "true" : undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /academic-periods
 * Cria um novo período acadêmico (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreatePeriodSchema),
  async (req: Request<{}, {}, CreatePeriodRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await academicPeriodsService.create({
        tenantId,
        ...req.body,
      });

      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /academic-periods/:id
 * Obtém um período acadêmico (admin only)
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await academicPeriodsService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /academic-periods/:id
 * Atualiza um período acadêmico (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdatePeriodSchema),
  async (req: Request<{ id: string }, {}, UpdatePeriodRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await academicPeriodsService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /academic-periods/:id
 * Deleta um período acadêmico (admin only)
 */
router.delete(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      await academicPeriodsService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
