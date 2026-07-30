/**
 * TenantSettingsService
 * Gerencia configurações de tenant multi-tenant.
 */

import { BaseService } from "./base.service";
import { NotFoundError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface UpdateTenantSettingsInput {
  recognitionThreshold?: number;
  livenessThreshold?: number;
  livenessEnabled?: boolean;
  allowManualOverride?: boolean;
  preAttendanceEnabled?: boolean;
  preAttendanceWindowMin?: number;
  individualCheckoutEnabled?: boolean;
  saveFraudFrames?: boolean;
  fraudRetentionHours?: number;
  enrollmentTokenExpiryHours?: number;
  requireConsentBeforeFacial?: boolean;
  enrollmentMultiFrameCount?: number;
  livenessThresholdEnrollment?: number;
  totemPanelPassword?: string | null;
  totemClockTimezone?: string;
}

export interface TenantSettingsOutput {
  tenantId: string;
  recognitionThreshold: number;
  livenessThreshold: number;
  livenessEnabled: boolean;
  allowManualOverride: boolean;
  preAttendanceEnabled: boolean;
  preAttendanceWindowMin: number;
  individualCheckoutEnabled: boolean;
  saveFraudFrames: boolean;
  fraudRetentionHours: number;
  enrollmentTokenExpiryHours: number;
  requireConsentBeforeFacial: boolean;
  enrollmentMultiFrameCount: number;
  livenessThresholdEnrollment: number;
  totemPanelPassword: string | null;
  totemClockTimezone: string;
  updatedAt: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class TenantSettingsService extends BaseService {
  /**
   * Obtém configurações de um tenant.
   */
  async getByTenant(tenantId: string): Promise<TenantSettingsOutput> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    if (!settings) throw new NotFoundError("Tenant settings not found");
    return this.toOutput(settings);
  }

  /**
   * Atualiza configurações de um tenant.
   */
  async update(
    tenantId: string,
    input: UpdateTenantSettingsInput
  ): Promise<TenantSettingsOutput> {
    // Verificar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const updated = await this.prisma.tenantSettings.update({
      where: { tenantId },
      data: {
        ...(input.recognitionThreshold !== undefined && { recognitionThreshold: input.recognitionThreshold }),
        ...(input.livenessThreshold !== undefined && { livenessThreshold: input.livenessThreshold }),
        ...(input.livenessEnabled !== undefined && { livenessEnabled: input.livenessEnabled }),
        ...(input.allowManualOverride !== undefined && { allowManualOverride: input.allowManualOverride }),
        ...(input.preAttendanceEnabled !== undefined && { preAttendanceEnabled: input.preAttendanceEnabled }),
        ...(input.preAttendanceWindowMin !== undefined && { preAttendanceWindowMin: input.preAttendanceWindowMin }),
        ...(input.individualCheckoutEnabled !== undefined && { individualCheckoutEnabled: input.individualCheckoutEnabled }),
        ...(input.saveFraudFrames !== undefined && { saveFraudFrames: input.saveFraudFrames }),
        ...(input.fraudRetentionHours !== undefined && { fraudRetentionHours: input.fraudRetentionHours }),
        ...(input.enrollmentTokenExpiryHours !== undefined && { enrollmentTokenExpiryHours: input.enrollmentTokenExpiryHours }),
        ...(input.requireConsentBeforeFacial !== undefined && { requireConsentBeforeFacial: input.requireConsentBeforeFacial }),
        ...(input.enrollmentMultiFrameCount !== undefined && { enrollmentMultiFrameCount: input.enrollmentMultiFrameCount }),
        ...(input.livenessThresholdEnrollment !== undefined && { livenessThresholdEnrollment: input.livenessThresholdEnrollment }),
        ...(input.totemPanelPassword !== undefined && { totemPanelPassword: input.totemPanelPassword }),
        ...(input.totemClockTimezone !== undefined && { totemClockTimezone: input.totemClockTimezone }),
      },
    });

    this.logger.info({ tenantId }, "Tenant settings updated");
    return this.toOutput(updated);
  }

  private toOutput(settings: any): TenantSettingsOutput {
    return {
      tenantId: settings.tenantId,
      recognitionThreshold: settings.recognitionThreshold,
      livenessThreshold: settings.livenessThreshold,
      livenessEnabled: settings.livenessEnabled,
      allowManualOverride: settings.allowManualOverride,
      preAttendanceEnabled: settings.preAttendanceEnabled,
      preAttendanceWindowMin: settings.preAttendanceWindowMin,
      individualCheckoutEnabled: settings.individualCheckoutEnabled,
      saveFraudFrames: settings.saveFraudFrames,
      fraudRetentionHours: settings.fraudRetentionHours,
      enrollmentTokenExpiryHours: settings.enrollmentTokenExpiryHours,
      requireConsentBeforeFacial: settings.requireConsentBeforeFacial,
      enrollmentMultiFrameCount: settings.enrollmentMultiFrameCount,
      livenessThresholdEnrollment: settings.livenessThresholdEnrollment,
      totemPanelPassword: settings.totemPanelPassword ?? null,
      totemClockTimezone: settings.totemClockTimezone ?? "local",
      updatedAt: settings.updatedAt,
    };
  }
}

export const tenantSettingsService = new TenantSettingsService();
