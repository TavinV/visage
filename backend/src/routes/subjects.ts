/**
 * Subjects Routes — catálogo de disciplinas do curso
 *
 * Aqui vive só o currículo: quais disciplinas o curso tem. Quem leciona e
 * quanta carga tem é por turma (ClassSubject, em /classes).
 *
 * Escrita é da secretaria (cargos acima de professor); professor tem leitura.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { subjectsService } from "../services/subjects.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

// Catálogo: só o nome da disciplina no currículo do curso. Professor e carga
// são decididos por turma, em PATCH /classes/:id { subjects }.
const CreateSubjectSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z.string().max(30).optional(),
});

const UpdateSubjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

type CreateSubjectRequest = z.infer<typeof CreateSubjectSchema>;
type UpdateSubjectRequest = z.infer<typeof UpdateSubjectSchema>;

const READ_ROLES = ["admin", "manager", "teacher", "super_admin"];
/** Secretaria: cargos acima de professor. */
const WRITE_ROLES = ["admin", "manager", "super_admin"];

/**
 * GET /subjects
 * Lista disciplinas do tenant. Professor recebe apenas as que pode lecionar.
 */
router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, userId, role } = req.tenant!;

    if (!READ_ROLES.includes(role)) {
      res.status(403).json({ error: "Forbidden", code: "forbidden" });
      return;
    }

    const result = await subjectsService.list({
      tenantId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
      search: req.query.search as string | undefined,
      courseId: req.query.courseId as string | undefined,
      isActive:
        req.query.isActive === undefined ? undefined : req.query.isActive === "true",
      // Professor: escopo travado nas disciplinas que ele leciona
      teacherId: role === "teacher" ? userId : (req.query.teacherId as string | undefined),
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /subjects
 * Cria uma disciplina (secretaria)
 */
router.post(
  "/",
  authenticate,
  validate(CreateSubjectSchema),
  async (req: Request<{}, {}, CreateSubjectRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!WRITE_ROLES.includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await subjectsService.create({ ...req.body, tenantId });
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /subjects/:id
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!READ_ROLES.includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await subjectsService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /subjects/:id
 * Atualiza carga horária, nome ou lista de professores (secretaria)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateSubjectSchema),
  async (
    req: Request<{ id: string }, {}, UpdateSubjectRequest>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!WRITE_ROLES.includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await subjectsService.update(req.params.id, tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /subjects/:id
 */
router.delete(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (!WRITE_ROLES.includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      await subjectsService.delete(req.params.id, tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
