/**
 * Tenants Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createTenant, getTenantById, listTenants } from "../services/tenants.service";
import { authenticate, requireSuperAdmin } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// Schema de validação
const CreateTenantSchema = z.object({
  name: z.string().min(3).max(200),
  document: z.string().max(20).optional(),
  institutionType: z.enum(["school", "university"]),
  planId: z.number().int().positive(),
});

type CreateTenantRequest = z.infer<typeof CreateTenantSchema>;

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
      const result = await createTenant(req.body);

      res.status(201).json({
        data: result,
      });
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
      const tenantId = parseInt(req.params.id, 10);

      // Validar que o usuário acessa seu próprio tenant ou é super admin
      if (req.tenant!.role !== "super_admin" && req.tenant!.tenantId !== tenantId) {
        res.status(403).json({
          error: "Forbidden",
          code: "forbidden",
        });
        return;
      }

      const tenant = await getTenantById(tenantId);

      res.json({
        data: tenant,
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
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

      const result = await listTenants(limit, offset);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
