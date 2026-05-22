/**
 * Tenants Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { tenantsService } from "../services/tenants.service";
import { authenticate, requireSuperAdmin } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { EmailSchema } from "../types";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name: z.string().min(3).max(200),
  document: z.string().max(20).optional(),
  institutionType: z.enum(["school", "university"]),
  planId: z.string().uuid(),
  adminUser: z.object({
    name: z.string().min(1).max(200),
    email: EmailSchema,
  }),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  document: z.string().max(20).optional(),
  institutionType: z.enum(["school", "university"]).optional(),
  planId: z.string().uuid().optional(),
  timezone: z.string().max(50).optional(),
  status: z.enum(["trial", "active", "suspended", "cancelled"]).optional(),
});

type CreateTenantRequest = z.infer<typeof CreateTenantSchema>;
type UpdateTenantRequest = z.infer<typeof UpdateTenantSchema>;

/**
 * POST /tenants
 * Cria novo tenant (super admin only)
 */
router.post(
  "/",
  authenticate,
  requireSuperAdmin,
  validate(CreateTenantSchema),
  async (req: Request<{}, {}, CreateTenantRequest>, res: Response, next: NextFunction) => {
    try {
      const result = await tenantsService.create(req.body);

      res.status(201).json({
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /tenants
 * Lista tenants (super admin only)
 */
router.get(
  "/",
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await tenantsService.list({
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        institutionType: req.query.institutionType as "school" | "university" | undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /tenants/:id
 * Busca tenant por ID
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;

      // Validar que o usuário acessa seu próprio tenant ou é super admin
      if (req.tenant!.role !== "super_admin" && req.tenant!.tenantId !== tenantId) {
        res.status(403).json({
          error: "Forbidden",
          code: "forbidden",
        });
        return;
      }

      const tenant = await tenantsService.findById(tenantId);

      res.json({
        data: tenant,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /tenants/:id
 * Atualiza tenant (super admin only)
 */
router.patch(
  "/:id",
  authenticate,
  requireSuperAdmin,
  validate(UpdateTenantSchema),
  async (req: Request<{ id: string }, {}, UpdateTenantRequest>, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const result = await tenantsService.update(tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tenants/:id/activate
 * Ativa um tenant suspenso (super admin only)
 */
router.post(
  "/:id/activate",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const result = await tenantsService.activate(tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tenants/:id/deactivate
 * Desativa um tenant (super admin only)
 */
router.post(
  "/:id/deactivate",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const result = await tenantsService.deactivate(tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /tenants/:id/cancel
 * Cancela um tenant (super admin only)
 */
router.post(
  "/:id/cancel",
  authenticate,
  requireSuperAdmin,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const result = await tenantsService.cancel(tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
