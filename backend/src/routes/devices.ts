/**
 * Devices Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { devicesService } from "../services/devices.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateDeviceSchema = z.object({
  deviceFingerprint: z.string().min(1).max(255),
  label: z.string().max(100).optional(),
  locationId: z.string().uuid().optional(),
});

const UpdateDeviceSchema = z.object({
  label: z.string().max(100).optional(),
  locationId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

type CreateDeviceRequest = z.infer<typeof CreateDeviceSchema>;
type UpdateDeviceRequest = z.infer<typeof UpdateDeviceSchema>;

/**
 * GET /devices
 * Lista dispositivos do tenant (admin only)
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

      const result = await devicesService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        isActive: req.query.isActive ? req.query.isActive === "true" : undefined,
        locationId: req.query.locationId as string | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /devices
 * Cria um novo dispositivo (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateDeviceSchema),
  async (req: Request<{}, {}, CreateDeviceRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await devicesService.create({
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
 * GET /devices/:id
 * Obtém um dispositivo (admin only)
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

      const result = await devicesService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /devices/:id
 * Atualiza um dispositivo (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateDeviceSchema),
  async (req: Request<{ id: string }, {}, UpdateDeviceRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await devicesService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /devices/:id
 * Deleta um dispositivo (admin only)
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

      await devicesService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
