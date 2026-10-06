/**
 * Áudio dos totens — configuração por instituição
 * (utils/totemAudio.ts e tenant-settings.service).
 *
 * Desligado por padrão: totem que já existe não pode começar a falar sozinho
 * depois da atualização. E a voz entregue ao totem precisa sempre apontar
 * para uma pasta de áudio que existe em frontend/public/audio/.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    tenantSettings: { findUnique: vi.fn(), update: vi.fn() },
  },
  recordChange: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));
vi.mock("../../src/services/audit.service", () => ({
  auditService: { recordChange: mocks.recordChange },
}));

import { resolveTotemAudio, TOTEM_VOICE_VALUES } from "../../src/utils/totemAudio";
import { tenantSettingsService } from "../../src/services/tenant-settings.service";

describe("resolveTotemAudio", () => {
  it("sem configuração: desligado, com a voz padrão", () => {
    expect(resolveTotemAudio(null)).toEqual({ enabled: false, voice: "telma" });
  });

  it("respeita a escolha da instituição", () => {
    expect(resolveTotemAudio({ totemAudioEnabled: true, totemVoice: "eduardo" })).toEqual({
      enabled: true,
      voice: "eduardo",
    });
  });

  it("voz desconhecida cai na padrão em vez de apontar para pasta inexistente", () => {
    expect(resolveTotemAudio({ totemAudioEnabled: true, totemVoice: "joana" }).voice).toBe(
      "telma"
    );
  });

  it("as vozes aceitas são exatamente as gravadas", () => {
    expect(TOTEM_VOICE_VALUES).toEqual(["telma", "eduardo"]);
  });
});

describe("tenantSettingsService — áudio dos totens", () => {
  const ROW = {
    tenantId: "tenant-a",
    recognitionThreshold: 1.1,
    livenessThreshold: 0.85,
    livenessEnabled: true,
    allowManualOverride: true,
    preAttendanceEnabled: false,
    preAttendanceWindowMin: 30,
    individualCheckoutEnabled: false,
    saveFraudFrames: true,
    fraudRetentionHours: 24,
    enrollmentTokenExpiryHours: 72,
    requireConsentBeforeFacial: true,
    enrollmentMultiFrameCount: 3,
    livenessThresholdEnrollment: 0.9,
    totemPanelPassword: null,
    totemClockTimezone: "local",
    totemAudioEnabled: false,
    totemVoice: "telma",
    studentIdentification: "cpf",
    totemIdentification: "cpf",
    validateCpf: true,
    updatedAt: new Date("2026-10-06T12:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-a",
      name: "Colégio Teste",
      logoUpdatedAt: null,
    });
    mocks.prisma.tenantSettings.findUnique.mockResolvedValue(ROW);
  });

  it("instituição existente começa com o áudio desligado", async () => {
    const out = await tenantSettingsService.getByTenant("tenant-a");

    expect(out.totemAudioEnabled).toBe(false);
    expect(out.totemVoice).toBe("telma");
  });

  it("grava a escolha e devolve no formato do painel", async () => {
    const updated = { ...ROW, totemAudioEnabled: true, totemVoice: "eduardo" };
    mocks.prisma.tenantSettings.update.mockResolvedValue(updated);
    mocks.prisma.tenantSettings.findUnique
      .mockResolvedValueOnce(ROW) // estado anterior, para a auditoria
      .mockResolvedValueOnce(updated); // releitura do getByTenant

    const out = await tenantSettingsService.update("tenant-a", {
      totemAudioEnabled: true,
      totemVoice: "eduardo",
    });

    expect(mocks.prisma.tenantSettings.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      data: { totemAudioEnabled: true, totemVoice: "eduardo" },
    });
    expect(out.totemAudioEnabled).toBe(true);
    expect(out.totemVoice).toBe("eduardo");
  });

  it("a mudança entra na trilha de auditoria", async () => {
    mocks.prisma.tenantSettings.update.mockResolvedValue({ ...ROW, totemAudioEnabled: true });

    await tenantSettingsService.update("tenant-a", { totemAudioEnabled: true });

    const { fields } = mocks.recordChange.mock.calls[0][0] as { fields: string[] };
    expect(fields).toContain("totemAudioEnabled");
    expect(fields).toContain("totemVoice");
  });

  it("salvar outras configurações não mexe no áudio", async () => {
    mocks.prisma.tenantSettings.update.mockResolvedValue(ROW);

    await tenantSettingsService.update("tenant-a", { allowManualOverride: false });

    const { data } = mocks.prisma.tenantSettings.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toEqual({ allowManualOverride: false });
  });
});
