/**
 * Tenant Settings Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { tenantSettingsService } from "../services/tenant-settings.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";

const router = Router();

// ── Schema de validação ───────────────────────────────────────────────────────

const UpdateSettingsSchema = z.object({
  recognitionThreshold: z.number().optional(),
  livenessThreshold: z.number().optional(),
  livenessEnabled: z.boolean().optional(),
  staticPixelThreshold: z.number().optional(),
  allowManualOverride: z.boolean().optional(),
  preAttendanceEnabled: z.boolean().optional(),
  preAttendanceWindowMin: z.number().int().optional(),
  individualCheckoutEnabled: z.boolean().optional(),
  saveFraudFrames: z.boolean().optional(),
  fraudRetentionHours: z.number().int().optional(),
  enrollmentTokenExpiryHours: z.number().int().optional(),
  requireConsentBeforeFacial: z.boolean().optional(),
  enrollmentMultiFrameCount: z.number().int().optional(),
  livenessThresholdEnrollment: z.number().optional(),
});

type UpdateSettingsRequest = z.infer<typeof UpdateSettingsSchema>;

/**
 * GET /tenant-settings
 * Obtém configurações do tenant do usuário autenticado
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await tenantSettingsService.getByTenant(tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /tenant-settings
 * Atualiza configurações do tenant (admin only)
 */
router.patch(
  "/",
  authenticate,
  validate(UpdateSettingsSchema),
  async (req: Request<{}, {}, UpdateSettingsRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, role } = req.tenant!;

      // Apenas admins podem atualizar
      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({
          error: "Forbidden",
          code: "forbidden",
        });
        return;
      }

      const result = await tenantSettingsService.update(tenantId, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
