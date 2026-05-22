/**
 * Class Sessions Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { classSessionsService } from "../services/class-sessions.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateSessionSchema = z.object({
  classId: z.string().uuid(),
  teacherId: z.string().uuid(),
  classesWorth: z.number().int().optional(),
});

const UpdateSessionSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  classesWorth: z.number().int().optional(),
});

type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;
type UpdateSessionRequest = z.infer<typeof UpdateSessionSchema>;

/**
 * GET /class-sessions
 * Lista sessões de chamada do tenant (admin only)
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

      const result = await classSessionsService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        classId: req.query.classId as string | undefined,
        status: req.query.status as "open" | "closed" | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions
 * Cria uma nova sessão de chamada (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateSessionSchema),
  async (req: Request<{}, {}, CreateSessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classSessionsService.create({
        tenantId,
        createdById: userId,
        ...req.body,
      });

      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id
 * Obtém uma sessão de chamada (admin only)
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

      const result = await classSessionsService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /class-sessions/:id
 * Atualiza uma sessão de chamada (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateSessionSchema),
  async (req: Request<{ id: string }, {}, UpdateSessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classSessionsService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions/:id/close
 * Fecha uma sessão de chamada (admin only)
 */
router.post(
  "/:id/close",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classSessionsService.close(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
