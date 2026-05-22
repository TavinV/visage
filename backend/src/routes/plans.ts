/**
 * Plans Routes
 * Gerenciamento de planos de assinatura (super_admin)
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { plansService } from "../services/plans.service";
import { authenticate, requireSuperAdmin } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

const CreatePlanSchema = z.object({
  name: z.string().min(2).max(100),
  maxClasses: z.number().int().positive(),
  priceMonthly: z.number().nonnegative(),
});

const UpdatePlanSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  maxClasses: z.number().int().positive().optional(),
  priceMonthly: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

type CreatePlanRequest = z.infer<typeof CreatePlanSchema>;
type UpdatePlanRequest = z.infer<typeof UpdatePlanSchema>;

/**
 * GET /plans
 * Lista planos ativos.
 * Query param ?all=true (super_admin) retorna planos inativos também.
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const showAll = req.tenant!.role === "super_admin" && req.query.all === "true";
      const result = await plansService.list({
        onlyActive: !showAll,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /plans/:id
 * Busca plano por ID
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const plan = await plansService.findById(req.params.id);
      res.json({ data: plan });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /plans
 * Cria novo plano (super_admin only)
 */
router.post(
  "/",
  authenticate,
  requireSuperAdmin,
  validate(CreatePlanSchema),
  async (req: Request<{}, {}, CreatePlanRequest>, res: Response, next: NextFunction) => {
    try {
      const plan = await plansService.create(req.body);
      res.status(201).json({ data: plan });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /plans/:id
 * Atualiza campos de um plano (super_admin only)
 */
router.patch(
  "/:id",
  authenticate,
  requireSuperAdmin,
  validate(UpdatePlanSchema),
  async (
    req: Request<{ id: string }, {}, UpdatePlanRequest>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const plan = await plansService.update(req.params.id, req.body);
      res.json({ data: plan });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /plans/:id
 * Desativa plano (soft delete — super_admin only)
 */
router.delete(
  "/:id",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      await plansService.deactivate(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
