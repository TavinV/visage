/**
 * Courses Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { coursesService } from "../services/courses.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateCourseSchema = z.object({
  academicPeriodId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

const UpdateCourseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  academicPeriodId: z.string().uuid().optional(),
});

type CreateCourseRequest = z.infer<typeof CreateCourseSchema>;
type UpdateCourseRequest = z.infer<typeof UpdateCourseSchema>;

/**
 * GET /courses
 * Lista cursos do tenant (admin only)
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!["admin", "manager", "teacher", "super_admin"].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await coursesService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        academicPeriodId: req.query.academicPeriodId as string | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /courses
 * Cria um novo curso (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateCourseSchema),
  async (req: Request<{}, {}, CreateCourseRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await coursesService.create({
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
 * GET /courses/:id
 * Obtém um curso (admin only)
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!["admin", "manager", "teacher", "super_admin"].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await coursesService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /courses/:id
 * Atualiza um curso (admin only)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateCourseSchema),
  async (req: Request<{ id: string }, {}, UpdateCourseRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await coursesService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /courses/:id
 * Deleta um curso (admin only)
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

      await coursesService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
