/**
 * Locations Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { locationsService } from "../services/locations.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateLocationSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(300).optional(),
});

const UpdateLocationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(300).optional(),
  isActive: z.boolean().optional(),
});

type CreateLocationRequest = z.infer<typeof CreateLocationSchema>;
type UpdateLocationRequest = z.infer<typeof UpdateLocationSchema>;

/**
 * GET /locations
 * Lista localizações do tenant (admin only)
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

      const result = await locationsService.list({
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
 * POST /locations
 * Cria uma nova localização (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateLocationSchema),
  async (req: Request<{}, {}, CreateLocationRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await locationsService.create({
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
 * GET /locations/:id
 * Obtém uma localização (admin only)
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

      const result = await locationsService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /locations/:id
 * Atualiza uma localização (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateLocationSchema),
  async (req: Request<{ id: string }, {}, UpdateLocationRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await locationsService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /locations/:id
 * Deleta uma localização (admin only)
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

      await locationsService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
