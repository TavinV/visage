/**
 * Class Enrollments Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { classEnrollmentsService } from "../services/class-enrollments.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateEnrollmentSchema = z.object({
  classId: z.string().uuid(),
  userId: z.string().uuid(),
});

type CreateEnrollmentRequest = z.infer<typeof CreateEnrollmentSchema>;

/**
 * GET /class-enrollments
 * Lista matrículas do tenant. Professor: apenas das próprias turmas
 * (exige classId de uma turma da qual seja responsável).
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

      if (role === "teacher") {
        // Basta lecionar UMA disciplina da turma para ver os matriculados
        const classId = req.query.classId as string | undefined;
        const ownClass = classId
          ? await prisma.class.findFirst({
              where: {
                id: classId,
                tenantId,
                classSubjects: { some: { teacherId: userId } },
              },
              select: { id: true },
            })
          : null;
        if (!ownClass) {
          res.status(403).json({ error: "Forbidden", code: "forbidden" });
          return;
        }
      }

      const result = await classEnrollmentsService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        classId: req.query.classId as string | undefined,
        userId: req.query.userId as string | undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-enrollments
 * Cria uma nova matrícula (admin only)
 */
router.post(
  "/",
  authenticate,
  validate(CreateEnrollmentSchema),
  async (req: Request<{}, {}, CreateEnrollmentRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classEnrollmentsService.create({
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
 * GET /class-enrollments/:classId/:userId
 * Obtém uma matrícula específica (admin only)
 */
router.get(
  "/:classId/:userId",
  authenticate,
  async (
    req: Request<{ classId: string; userId: string }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classEnrollmentsService.findByIds(
        req.params.classId,
        req.params.userId,
        tenantId
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /class-enrollments/:classId/:userId
 * Remove uma matrícula (admin only)
 */
router.delete(
  "/:classId/:userId",
  authenticate,
  async (
    req: Request<{ classId: string; userId: string }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, role } = req.tenant!;

      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      await classEnrollmentsService.delete(
        req.params.classId,
        req.params.userId,
        tenantId
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
