/**
 * TenantSettingsService
 * Gerencia configurações de tenant multi-tenant.
 */

import { BaseService } from "./base.service";
import { NotFoundError } from "../utils/errors";
import {
  resolveIdentification,
  type StudentIdentification,
  type TotemIdentification,
} from "../utils/identification";
import { resolveTotemAudio, type TotemVoice } from "../utils/totemAudio";
import { auditService } from "./audit.service";

/**
 * Todas as configurações operacionais entram na trilha — não há aqui nenhum
 * campo cujo valor não importe para uma auditoria. `totemPanelPassword` é
 * incluída de propósito: interessa saber QUE a senha do painel mudou, e o
 * diff a redige antes de gravar.
 */
const AUDITED_SETTINGS_FIELDS = [
  "recognitionThreshold",
  "livenessThreshold",
  "livenessEnabled",
  "allowManualOverride",
  "preAttendanceEnabled",
  "preAttendanceWindowMin",
  "individualCheckoutEnabled",
  "saveFraudFrames",
  "fraudRetentionHours",
  "enrollmentTokenExpiryHours",
  "requireConsentBeforeFacial",
  "enrollmentMultiFrameCount",
  "livenessThresholdEnrollment",
  "totemPanelPassword",
  "totemClockTimezone",
  "totemAudioEnabled",
  "totemVoice",
  "studentIdentification",
  "totemIdentification",
  "validateCpf",
] as const;

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
  totemAudioEnabled?: boolean;
  totemVoice?: TotemVoice;
  studentIdentification?: StudentIdentification;
  totemIdentification?: TotemIdentification;
  validateCpf?: boolean;
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
  /** Totens falam as orientações e confirmações (além dos bipes). */
  totemAudioEnabled: boolean;
  totemVoice: TotemVoice;
  /** Identificadores registrados no cadastro do aluno. */
  studentIdentification: StudentIdentification;
  /** O que o aluno digita no totem — já ajustado ao que é registrado. */
  totemIdentification: TotemIdentification;
  /** Confere os dígitos verificadores do CPF no cadastro. */
  validateCpf: boolean;
  /** Logo da instituição já enviada — o painel decide se busca a imagem. */
  hasLogo: boolean;
  logoUpdatedAt?: Date;
  updatedAt: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class TenantSettingsService extends BaseService {
  /**
   * Obtém configurações de um tenant.
   */
  async getByTenant(tenantId: string): Promise<TenantSettingsOutput> {
    const [settings, tenant] = await Promise.all([
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { logoUpdatedAt: true },
      }),
    ]);
    if (!settings) throw new NotFoundError("Tenant settings not found");
    return this.toOutput(settings, tenant?.logoUpdatedAt ?? null);
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

    const before = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });

    const after = await this.prisma.tenantSettings.update({
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
        ...(input.totemAudioEnabled !== undefined && { totemAudioEnabled: input.totemAudioEnabled }),
        ...(input.totemVoice !== undefined && { totemVoice: input.totemVoice }),
        ...(input.studentIdentification !== undefined && { studentIdentification: input.studentIdentification }),
        ...(input.totemIdentification !== undefined && { totemIdentification: input.totemIdentification }),
        ...(input.validateCpf !== undefined && { validateCpf: input.validateCpf }),
      },
    });

    // Aqui moram os parâmetros que definem o rigor do antifraude e a retenção
    // de dados pessoais. Toda mudança guarda o valor exato de antes e depois —
    // é o que permite explicar depois por que o reconhecimento passou a aceitar
    // o que antes recusava. A senha do painel do totem é redigida pelo diff.
    auditService.recordChange({
      action: "settings.updated",
      tenantId,
      targetId: tenantId,
      targetLabel: tenant.name,
      before,
      after,
      fields: AUDITED_SETTINGS_FIELDS,
      details: `Configurações de ${tenant.name} alteradas`,
    });

    this.logger.info({ tenantId }, "Tenant settings updated");
    return this.getByTenant(tenantId);
  }

  private toOutput(settings: any, logoUpdatedAt: Date | null): TenantSettingsOutput {
    // Sai já normalizada: o painel e o totem leem o modo efetivo, nunca uma
    // combinação impossível (ex.: totem pedindo CPF numa escola sem CPF)
    const identification = resolveIdentification(settings);
    const audio = resolveTotemAudio(settings);
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
      totemAudioEnabled: audio.enabled,
      totemVoice: audio.voice,
      studentIdentification: identification.studentIdentification,
      totemIdentification: identification.totemIdentification,
      validateCpf: identification.validateCpf,
      hasLogo: logoUpdatedAt != null,
      logoUpdatedAt: logoUpdatedAt ?? undefined,
      updatedAt: settings.updatedAt,
    };
  }
}

export const tenantSettingsService = new TenantSettingsService();
