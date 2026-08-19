/**
 * Courses Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { coursesService } from "../services/courses.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { parseDate, boolParam } from "../utils/query";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateCourseSchema = z.object({
  academicPeriodId: z.string().uuid(),
  name: z.string().min(1).max(200),
  // Duração de uma aula — a faixa operável é validada no service, que
  // normaliza a unidade para minutos
  lessonsPerDay: z.number().int().min(1).max(20).optional(),
  lessonDuration: z.number().int().min(1).max(480).optional(),
  lessonDurationUnit: z.enum(["minutes", "hours"]).optional(),
});

const UpdateCourseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  academicPeriodId: z.string().uuid().optional(),
  lessonsPerDay: z.number().int().min(1).max(20).optional(),
  lessonDuration: z.number().int().min(1).max(480).optional(),
  lessonDurationUnit: z.enum(["minutes", "hours"]).optional(),
});

// Grade do curso aplicada em lote nas turmas: mesmas disciplinas, professor
// escolhido por disciplina (e ajustável depois, turma a turma)
const ApplyCurriculumSchema = z.object({
  classIds: z.array(z.string().uuid()).optional(),
  subjects: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        teacherIds: z.array(z.string().uuid()).min(1).max(20),
        lessonsPerSession: z.number().int().min(1).max(12).optional(),
        totalLessonsPlanned: z.number().int().min(0).max(1000).optional(),
        lessonDurationMin: z.number().int().min(1).max(480).optional(),
      })
    )
    .min(1),
  existing: z.enum(["skip", "sync", "replace"]).optional(),
});

type CreateCourseRequest = z.infer<typeof CreateCourseSchema>;
type UpdateCourseRequest = z.infer<typeof UpdateCourseSchema>;
type ApplyCurriculumRequest = z.infer<typeof ApplyCurriculumSchema>;

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
        createdFrom: parseDate(req.query.created_from),
        createdTo: parseDate(req.query.created_to, true),
        hasClasses: boolParam(req.query.hasClasses),
        hasSubjects: boolParam(req.query.hasSubjects),
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
 * POST /courses/:id/curriculum/apply
 * Aplica a grade do curso nas turmas (secretaria).
 *
 * Body: { subjects: [{ subjectId, teacherIds, lessonsPerSession?,
 * totalLessonsPlanned? }], classIds?, existing?: skip|sync|replace }
 */
router.post(
  "/:id/curriculum/apply",
  authenticate,
  validate(ApplyCurriculumSchema),
  async (
    req: Request<{ id: string }, {}, ApplyCurriculumRequest>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!["admin", "manager", "super_admin"].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await coursesService.applyCurriculum(
        req.params.id,
        tenantId,
        req.body
      );
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
