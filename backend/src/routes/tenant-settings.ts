/**
 * Tenant Settings Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { tenantSettingsService } from "../services/tenant-settings.service";
import { profilePhotosService } from "../services/profile-photos.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { logger } from "../lib/logger";

const router = Router();

// ── Schema de validação ───────────────────────────────────────────────────────

const UpdateSettingsSchema = z.object({
  recognitionThreshold: z.number().optional(),
  livenessThreshold: z.number().optional(),
  livenessEnabled: z.boolean().optional(),
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
  // Senha do painel do totem — template com {{data}}/{{hora}}; null desativa
  totemPanelPassword: z.string().max(200).nullable().optional(),
  totemClockTimezone: z.string().max(50).optional(),
});

const LogoUploadSchema = z.object({
  imageB64: z.string().min(100),
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

/**
 * GET /tenant-settings/logo
 * Logo da instituição — visível para qualquer usuário autenticado do tenant
 */
router.get("/logo", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { stream, contentType } = await profilePhotosService.getTenantLogoStream(tenantId);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    stream.on("error", (error) => {
      logger.error({ error, tenantId }, "Tenant logo stream error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read logo", code: "internal_error" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /tenant-settings/logo
 * Envia a logo da instituição (admin only)
 */
router.put(
  "/logo",
  authenticate,
  validate(LogoUploadSchema),
  async (
    req: Request<{}, {}, z.infer<typeof LogoUploadSchema>>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, role } = req.tenant!;
      if (role !== "admin" && role !== "super_admin") {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await profilePhotosService.setTenantLogo(tenantId, req.body.imageB64);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /tenant-settings/logo
 */
router.delete("/logo", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, role } = req.tenant!;
    if (role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Forbidden", code: "forbidden" });
      return;
    }

    await profilePhotosService.deleteTenantLogo(tenantId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
