/**
 * Classes Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { classesService } from "../services/classes.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateClassSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(100),
  teacherId: z.string().uuid(),
  room: z.string().max(50).optional(),
  locationId: z.string().uuid().optional(),
  totalClassesPlanned: z.number().int().optional(),
});

const UpdateClassSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  teacherId: z.string().uuid().optional(),
  room: z.string().max(50).optional(),
  locationId: z.string().uuid().optional(),
  totalClassesPlanned: z.number().int().optional(),
});

type CreateClassRequest = z.infer<typeof CreateClassSchema>;
type UpdateClassRequest = z.infer<typeof UpdateClassSchema>;

/**
 * GET /classes
 * Lista turmas do tenant. Professor recebe apenas as próprias turmas.
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId, role } = req.tenant!;

      if (!["admin", "manager", "teacher", "super_admin"].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classesService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        courseId: req.query.courseId as string | undefined,
        // Professor: escopo travado nas próprias turmas
        teacherId: role === "teacher" ? userId : (req.query.teacherId as string | undefined),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /classes
 * Cria uma nova turma (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateClassSchema),
  async (req: Request<{}, {}, CreateClassRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classesService.create({
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
 * GET /classes/:id
 * Obtém uma turma. Professor só enxerga turmas das quais é responsável.
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId, role } = req.tenant!;

      if (!["admin", "manager", "teacher", "super_admin"].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classesService.findById(req.params.id, tenantId);
      if (role === "teacher" && result.teacherId !== userId) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /classes/:id
 * Atualiza uma turma (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateClassSchema),
  async (req: Request<{ id: string }, {}, UpdateClassRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classesService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /classes/:id
 * Deleta uma turma (admin only)
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

      await classesService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
