/**
 * Testes críticos — token QR Code de uso único (enrollment.service.ts).
 *
 * A invalidação atômica é o `updateMany` com `status: 'pending'` no WHERE:
 * duas chamadas concorrentes com o mesmo token → apenas uma retorna count=1.
 * Estes testes garantem que o serviço monta exatamente esse filtro e trata
 * count=0 como falha (nunca prossegue).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../src/utils/errors";

const mocks = vi.hoisted(() => ({
  prisma: {
    enrollmentToken: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: { findFirst: vi.fn(), updateMany: vi.fn() },
    tenantSettings: { findUnique: vi.fn() },
    biometricConsent: { create: vi.fn() },
    facialEmbedding: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  redis: {
    set: vi.fn(async () => "OK"),
    get: vi.fn(async () => null),
    del: vi.fn(async () => 1),
  },
}));

vi.mock("../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));
vi.mock("../src/lib/redis", () => ({
  redis: mocks.redis,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));
vi.mock("../src/lib/faceEngine", () => ({
  engineEnrollFrame: vi.fn(),
  engineEnrollFinalize: vi.fn(),
  engineInvalidateEmbedding: vi.fn(async () => undefined),
}));

import { enrollmentService } from "../src/services/enrollment.service";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const DEVICE = "device-1";
const FINGERPRINT = "fp-123";
const TOKEN = "tok_1234567890abcdef";

function setupHappyPath() {
  mocks.prisma.enrollmentToken.updateMany.mockResolvedValueOnce({ count: 1 });
  mocks.prisma.enrollmentToken.findFirst.mockResolvedValueOnce({ userId: "student-1" });
  mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: "student-1", name: "Aluno Teste" });
  mocks.prisma.tenantSettings.findUnique.mockResolvedValueOnce({
    requireConsentBeforeFacial: true,
    enrollmentMultiFrameCount: 3,
    livenessThresholdEnrollment: 0.9,
  });
}

describe("enrollment token — uso único e isolamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consome token com filtro atômico status='pending' + tenantId", async () => {
    setupHappyPath();

    const result = await enrollmentService.validateToken(TENANT_A, DEVICE, TOKEN, FINGERPRINT);

    expect(result.sessionId).toHaveLength(32);
    expect(result.student.id).toBe("student-1");

    const updateArgs = mocks.prisma.enrollmentToken.updateMany.mock.calls[0][0];
    // O filtro atômico que impede corrida: SÓ consome se ainda pending
    expect(updateArgs.where.status).toBe("pending");
    expect(updateArgs.where.tenantId).toBe(TENANT_A);
    expect(updateArgs.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(updateArgs.data.status).toBe("used");
  });

  it("segunda chamada concorrente (count=0, token já 'used') falha com TOKEN_ALREADY_USED", async () => {
    // Simula o perdedor da corrida: updateMany não afetou nenhuma linha
    mocks.prisma.enrollmentToken.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.enrollmentToken.findFirst.mockResolvedValueOnce({
      status: "used",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      enrollmentService.validateToken(TENANT_A, DEVICE, TOKEN, FINGERPRINT)
    ).rejects.toMatchObject({ code: "TOKEN_ALREADY_USED" });

    // Nunca cria sessão no Redis quando o consumo falha
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("token de outro tenant não é encontrado (isolamento cross-tenant)", async () => {
    // Token pertence ao tenant A; totem do tenant B tenta consumir
    mocks.prisma.enrollmentToken.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.enrollmentToken.findFirst.mockResolvedValueOnce(null);

    await expect(
      enrollmentService.validateToken(TENANT_B, DEVICE, TOKEN, FINGERPRINT)
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });

    // Toda query levou o tenantId do dispositivo (nunca vaza entre tenants)
    const updateArgs = mocks.prisma.enrollmentToken.updateMany.mock.calls[0][0];
    expect(updateArgs.where.tenantId).toBe(TENANT_B);
    const findArgs = mocks.prisma.enrollmentToken.findFirst.mock.calls[0][0];
    expect(findArgs.where.tenantId).toBe(TENANT_B);
  });

  it("token expirado falha com TOKEN_EXPIRED e é marcado como expired", async () => {
    mocks.prisma.enrollmentToken.updateMany
      .mockResolvedValueOnce({ count: 0 }) // consumo falhou
      .mockResolvedValueOnce({ count: 1 }); // marcação de expired
    mocks.prisma.enrollmentToken.findFirst.mockResolvedValueOnce({
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      enrollmentService.validateToken(TENANT_A, DEVICE, TOKEN, FINGERPRINT)
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("sessão expirada no Redis falha com ENROLLMENT_SESSION_EXPIRED", async () => {
    mocks.redis.get.mockResolvedValueOnce(null);

    await expect(
      enrollmentService.processFrame(TENANT_A, "f".repeat(32), "x".repeat(200))
    ).rejects.toMatchObject({ code: "ENROLLMENT_SESSION_EXPIRED" });
  });

  it("sessão de outro tenant é tratada como inexistente (guard cross-tenant)", async () => {
    mocks.redis.get.mockResolvedValueOnce(
      JSON.stringify({
        tenantId: TENANT_A,
        userId: "student-1",
        deviceId: DEVICE,
        step: "capture",
        requiredFrames: 3,
        livenessThresholdEnrollment: 0.9,
        frames: [],
      })
    );

    await expect(
      enrollmentService.processFrame(TENANT_B, "f".repeat(32), "x".repeat(200))
    ).rejects.toMatchObject({ code: "ENROLLMENT_SESSION_EXPIRED" });
  });

  it("erro do tipo ValidationError carrega status 400", async () => {
    mocks.prisma.enrollmentToken.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.enrollmentToken.findFirst.mockResolvedValueOnce(null);

    try {
      await enrollmentService.validateToken(TENANT_A, DEVICE, TOKEN, FINGERPRINT);
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).status).toBe(400);
    }
  });
});
