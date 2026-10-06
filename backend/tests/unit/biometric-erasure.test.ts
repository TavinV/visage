/**
 * Exclusão da biometria pelo próprio aluno no totem
 * (enrollment.service → lookupForErasure / confirmErasure).
 *
 * O identificador digitado só aponta QUAL cadastro apagar — quem autoriza é o
 * rosto. Os contratos aqui são inegociáveis:
 *   1. nada é apagado sem um reconhecimento facial que confira, feito na hora;
 *   2. CPF/matrícula de outra pessoa compara só contra a biometria DELA;
 *   3. toda consulta e escrita fica na instituição do totem;
 *   4. a exclusão é uma transação só — ou tudo, ou nada;
 *   5. a trilha registra o desfecho, nunca imagem, embedding ou score.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    tenantSettings: { findUnique: vi.fn() },
    device: { findFirst: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    facialEmbedding: { findMany: vi.fn(), deleteMany: vi.fn() },
    enrollmentToken: { deleteMany: vi.fn() },
    biometricConsent: { updateMany: vi.fn() },
    tenantKeys: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), del: vi.fn() },
  engineRecognize: vi.fn(),
  engineInvalidateEmbedding: vi.fn(),
  auditRecord: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));
vi.mock("../../src/lib/redis", () => ({
  redis: mocks.redis,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));
vi.mock("../../src/lib/faceEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/faceEngine")>();
  return {
    ...actual,
    engineRecognize: mocks.engineRecognize,
    engineInvalidateEmbedding: mocks.engineInvalidateEmbedding,
    engineEnrollFrame: vi.fn(),
    engineEnrollFinalize: vi.fn(),
  };
});
vi.mock("../../src/services/audit.service", () => ({
  auditService: { record: mocks.auditRecord },
}));
vi.mock("../../src/services/email.service", () => ({ emailService: { send: vi.fn() } }));

import { enrollmentService } from "../../src/services/enrollment.service";
import { FaceEngineError } from "../../src/lib/faceEngine";
import { NotFoundError, ValidationError } from "../../src/utils/errors";

const TENANT = "tenant-a";
const DEVICE = "device-1";
const CPF = "529.982.247-25";

const STUDENT = {
  id: "student-maria",
  name: "Maria Clara Souza",
  document: "52998224725",
  enrollmentCode: "2026001",
  facialStatus: "registered",
};

const EMBEDDING_ROW = {
  userId: STUDENT.id,
  embeddingIv: new Uint8Array([0x01, 0x02, 0x03]),
  embeddingTag: new Uint8Array([0x04, 0x05, 0x06]),
  embeddingCt: new Uint8Array([0x07, 0x08, 0x09]),
  keyVersion: 1,
};

const IMAGE_B64 = Buffer.from("frame-jpeg-do-totem").toString("base64").padEnd(200, "A");

/** Sentinelas: provam que cada escrita foi entregue ao MESMO $transaction. */
const WRITES = {
  embeddings: { write: "facialEmbedding.deleteMany", count: 1 },
  tokens: { write: "enrollmentToken.deleteMany", count: 0 },
  consents: { write: "biometricConsent.updateMany", count: 1 },
  user: { write: "user.updateMany", count: 1 },
};

const FAILURES_KEY = `erase:failures:${TENANT}:${STUDENT.id}`;

function confirm(identifier = CPF) {
  return enrollmentService.confirmErasure(TENANT, DEVICE, identifier, IMAGE_B64);
}

function identified(personId = STUDENT.id) {
  return { status: "identified", person_id: personId, confidence: 0.97, processing_ms: 80 };
}

describe("exclusão da biometria pelo titular", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.tenantSettings.findUnique.mockResolvedValue({
      studentIdentification: "cpf",
      totemIdentification: "cpf",
      validateCpf: true,
      recognitionThreshold: 1.1,
      livenessThreshold: 0.85,
      livenessThresholdEnrollment: 0.9,
    });
    mocks.prisma.device.findFirst.mockResolvedValue({
      recognitionThreshold: null,
      livenessThreshold: null,
    });
    mocks.prisma.user.findMany.mockResolvedValue([STUDENT]);
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: STUDENT.id,
      name: STUDENT.name,
      role: "student",
      facialStatus: "registered",
    });
    mocks.prisma.facialEmbedding.findMany.mockResolvedValue([EMBEDDING_ROW]);
    mocks.prisma.tenantKeys.findUnique.mockResolvedValue({
      dekCt: new Uint8Array([0xaa]),
      dekIv: new Uint8Array([0xbb]),
      dekTag: new Uint8Array([0xcc]),
      keyVersion: 1,
    });

    mocks.prisma.facialEmbedding.deleteMany.mockReturnValue(WRITES.embeddings);
    mocks.prisma.enrollmentToken.deleteMany.mockReturnValue(WRITES.tokens);
    mocks.prisma.biometricConsent.updateMany.mockReturnValue(WRITES.consents);
    mocks.prisma.user.updateMany.mockReturnValue(WRITES.user);
    mocks.prisma.$transaction.mockImplementation(async (ops: Array<{ count: number }>) =>
      ops.map((op) => ({ count: op.count }))
    );

    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue("OK");
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.del.mockResolvedValue(1);

    mocks.engineRecognize.mockResolvedValue(identified());
    mocks.engineInvalidateEmbedding.mockResolvedValue(undefined);
  });

  // ── Passo de confirmação ──────────────────────────────────────────────────

  describe("lookupForErasure", () => {
    it("acha o aluno pelo identificador e devolve só o primeiro nome", async () => {
      const result = await enrollmentService.lookupForErasure(TENANT, CPF);

      expect(result).toEqual({ firstName: "Maria" });
      // Minimização: nada de CPF, matrícula ou nome completo na resposta
      expect(JSON.stringify(result)).not.toContain(STUDENT.document);
      expect(JSON.stringify(result)).not.toContain("Souza");
    });

    it("aluno sem biometria guardada: avisa antes de abrir a câmera", async () => {
      mocks.prisma.facialEmbedding.findMany.mockResolvedValue([]);

      const error = await enrollmentService.lookupForErasure(TENANT, CPF).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe("NO_BIOMETRIC_DATA");
    });

    it("identificador sem aluno na instituição: não encontrado", async () => {
      mocks.prisma.user.findMany.mockResolvedValue([]);

      await expect(enrollmentService.lookupForErasure(TENANT, CPF)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it("aluno bloqueado por recusas recentes não chega à câmera", async () => {
      mocks.redis.get.mockResolvedValue("3");

      const error = await enrollmentService.lookupForErasure(TENANT, CPF).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe("ERASURE_LOCKED");
      expect(mocks.redis.get).toHaveBeenCalledWith(FAILURES_KEY);
    });
  });

  // ── Exclusão somente após validação facial ────────────────────────────────

  describe("confirmErasure — só apaga depois do rosto conferir", () => {
    it("rosto confere: apaga embeddings, tokens e consentimento numa transação só", async () => {
      const result = await confirm();

      expect(result).toEqual({ erased: true });
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
      expect(mocks.prisma.$transaction.mock.calls[0][0]).toEqual([
        WRITES.embeddings,
        WRITES.tokens,
        WRITES.consents,
        WRITES.user,
      ]);

      expect(mocks.prisma.facialEmbedding.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, userId: STUDENT.id },
      });
      expect(mocks.prisma.enrollmentToken.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, userId: STUDENT.id },
      });
      // Consentimento revogado pelo próprio titular, mas mantido como prova legal
      const consentArgs = mocks.prisma.biometricConsent.updateMany.mock.calls[0][0] as any;
      expect(consentArgs.where).toEqual({ tenantId: TENANT, userId: STUDENT.id, isActive: true });
      expect(consentArgs.data).toMatchObject({ isActive: false, revokedById: STUDENT.id });
      expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: STUDENT.id, tenantId: TENANT },
        data: { facialStatus: "revoked" },
      });
    });

    it("rosto confere: limpa o cache da engine e zera as recusas", async () => {
      await confirm();

      // Sem isso a engine seguiria com o embedding decifrado em memória
      expect(mocks.engineInvalidateEmbedding).toHaveBeenCalledWith(TENANT, STUDENT.id);
      expect(mocks.redis.del).toHaveBeenCalledWith(FAILURES_KEY);
    });

    it("falha ao zerar as recusas depois de apagar não vira erro para o aluno", async () => {
      mocks.redis.del.mockRejectedValue(new Error("redis indisponível"));

      await expect(confirm()).resolves.toEqual({ erased: true });
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    });

    it("a verificação facial acontece antes de qualquer escrita", async () => {
      await confirm();

      const verifiedAt = mocks.engineRecognize.mock.invocationCallOrder[0];
      const firstWriteAt = Math.min(
        mocks.prisma.facialEmbedding.deleteMany.mock.invocationCallOrder[0],
        mocks.prisma.$transaction.mock.invocationCallOrder[0]
      );
      expect(verifiedAt).toBeLessThan(firstWriteAt);
    });

    it("rosto não confere: nada é apagado e a recusa entra na trilha", async () => {
      mocks.engineRecognize.mockResolvedValue({ status: "face_not_recognized", processing_ms: 90 });

      const result = await confirm();

      expect(result).toEqual({ erased: false, reason: "face_mismatch", attemptsLeft: 2 });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.prisma.facialEmbedding.deleteMany).not.toHaveBeenCalled();
      expect(mocks.engineInvalidateEmbedding).not.toHaveBeenCalled();
      expect(mocks.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "data.erasure_denied",
          status: "failure",
          tenantId: TENANT,
          targetId: STUDENT.id,
          metadata: { reason: "face_mismatch", attemptsLeft: 2 },
        })
      );
    });

    it("vivacidade reprovada (foto ou tela): nada é apagado e a tentativa conta", async () => {
      mocks.engineRecognize.mockResolvedValue({ status: "liveness_failed", processing_ms: 60 });

      const result = await confirm();

      expect(result).toEqual({ erased: false, reason: "liveness_failed", attemptsLeft: 2 });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.redis.incr).toHaveBeenCalledWith(FAILURES_KEY);
    });

    it.each(["no_face_detected", "multiple_faces_detected"])(
      "%s: pede nova captura sem gastar tentativa",
      async (status) => {
        mocks.engineRecognize.mockResolvedValue({ status, processing_ms: 20 });

        const result = await confirm();

        expect(result).toEqual({ erased: false, reason: status });
        expect(mocks.redis.incr).not.toHaveBeenCalled();
        expect(mocks.auditRecord).not.toHaveBeenCalled();
        expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      }
    );

    it("engine fora do ar: o erro sobe, nada é apagado e não conta tentativa", async () => {
      mocks.engineRecognize.mockRejectedValue(new FaceEngineError("Face engine unreachable", 502));

      await expect(confirm()).rejects.toBeInstanceOf(FaceEngineError);
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.redis.incr).not.toHaveBeenCalled();
    });

    it("transação falha: o erro sobe e nada é dado como apagado", async () => {
      mocks.prisma.$transaction.mockRejectedValue(new Error("deadlock detected"));

      await expect(confirm()).rejects.toThrow("deadlock detected");
      expect(mocks.auditRecord).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "data.erased" })
      );
      expect(mocks.engineInvalidateEmbedding).not.toHaveBeenCalled();
      expect(mocks.redis.del).not.toHaveBeenCalled();
    });

    it("biometria já apagada (outro totem, admin): não há o que confirmar", async () => {
      mocks.prisma.facialEmbedding.findMany.mockResolvedValue([]);

      const error = await confirm().catch((e) => e);

      expect(error.code).toBe("NO_BIOMETRIC_DATA");
      expect(mocks.engineRecognize).not.toHaveBeenCalled();
    });
  });

  // ── Impossibilidade de excluir a biometria de outra pessoa ────────────────

  describe("CPF ou matrícula de outra pessoa", () => {
    it("a comparação usa só a biometria do dono do identificador", async () => {
      await confirm();

      expect(mocks.prisma.facialEmbedding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, userId: STUDENT.id, user: { tenantId: TENANT } },
        })
      );
      const { candidates } = mocks.engineRecognize.mock.calls[0][0] as any;
      expect(candidates).toEqual([
        {
          person_id: STUDENT.id,
          embedding_iv: "010203",
          embedding_tag: "040506",
          embedding_ct: "070809",
          key_version: 1,
        },
      ]);
    });

    it("engine apontando outra pessoa nunca autoriza a exclusão", async () => {
      mocks.engineRecognize.mockResolvedValue(identified("student-outro"));

      const result = await confirm();

      expect(result).toMatchObject({ erased: false, reason: "face_mismatch" });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("três recusas bloqueiam a exclusão daquele aluno", async () => {
      mocks.engineRecognize.mockResolvedValue({ status: "face_not_recognized", processing_ms: 90 });
      mocks.redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      expect((await confirm()).attemptsLeft).toBe(2);
      expect((await confirm()).attemptsLeft).toBe(1);
      expect((await confirm()).attemptsLeft).toBe(0);

      // A partir daqui o contador no Redis já está no teto
      mocks.redis.get.mockResolvedValue("3");
      mocks.engineRecognize.mockClear();
      const error = await confirm().catch((e) => e);

      expect(error.code).toBe("ERASURE_LOCKED");
      expect(mocks.engineRecognize).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("a janela do bloqueio nasce com prazo antes de contar a recusa", async () => {
      mocks.engineRecognize.mockResolvedValue({ status: "face_not_recognized", processing_ms: 90 });

      await confirm();

      expect(mocks.redis.set).toHaveBeenCalledWith(FAILURES_KEY, "0", { NX: true, EX: 15 * 60 });
      expect(mocks.redis.set.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.redis.incr.mock.invocationCallOrder[0]
      );
    });
  });

  // ── Isolamento por tenant ─────────────────────────────────────────────────

  describe("isolamento por tenant", () => {
    it("toda consulta e escrita leva a instituição do totem", async () => {
      await confirm();

      expect((mocks.prisma.user.findMany.mock.calls[0][0] as any).where).toMatchObject({
        tenantId: TENANT,
        role: "student",
      });
      expect(mocks.prisma.device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: DEVICE, tenantId: TENANT } })
      );
      expect(mocks.prisma.tenantKeys.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT },
      });
      expect((mocks.engineRecognize.mock.calls[0][0] as any).tenantId).toBe(TENANT);
      expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: STUDENT.id, tenantId: TENANT } })
      );
    });

    it("aluno de outra instituição não é encontrado e a engine nem é chamada", async () => {
      // A query já filtra pelo tenant do totem — o banco devolve vazio
      mocks.prisma.user.findMany.mockResolvedValue([]);

      await expect(confirm()).rejects.toBeInstanceOf(NotFoundError);
      expect(mocks.engineRecognize).not.toHaveBeenCalled();
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── Rigor da verificação ──────────────────────────────────────────────────

  describe("limiares da confirmação", () => {
    it("reconhecimento calibrado do totem e vivacidade no rigor do cadastro", async () => {
      mocks.prisma.device.findFirst.mockResolvedValue({
        recognitionThreshold: 0.95,
        livenessThreshold: 0.7,
      });

      await confirm();

      expect((mocks.engineRecognize.mock.calls[0][0] as any).thresholds).toEqual({
        recognitionThreshold: 0.95,
        livenessThreshold: 0.9,
      });
    });

    it("nunca abaixo do rigor da chamada neste totem", async () => {
      mocks.prisma.device.findFirst.mockResolvedValue({
        recognitionThreshold: null,
        livenessThreshold: 0.93,
      });

      await confirm();

      expect((mocks.engineRecognize.mock.calls[0][0] as any).thresholds).toEqual({
        recognitionThreshold: 1.1,
        livenessThreshold: 0.93,
      });
    });

    it("calibração absurda fica presa na faixa operável", async () => {
      mocks.prisma.tenantSettings.findUnique.mockResolvedValue({
        studentIdentification: "cpf",
        totemIdentification: "cpf",
        validateCpf: true,
        recognitionThreshold: 1.1,
        livenessThreshold: 0.85,
        livenessThresholdEnrollment: 0.99,
      });

      await confirm();

      expect((mocks.engineRecognize.mock.calls[0][0] as any).thresholds.livenessThreshold).toBe(
        0.95
      );
    });
  });

  // ── Auditoria sem biometria ───────────────────────────────────────────────

  it("a trilha registra o desfecho sem imagem, embedding nem score", async () => {
    mocks.engineRecognize.mockResolvedValueOnce({
      status: "face_not_recognized",
      best_distance_raw: 1.31,
      liveness_combined_raw: 0.97,
      processing_ms: 90,
    });
    await confirm();
    await confirm();

    const trail = JSON.stringify(mocks.auditRecord.mock.calls);
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.erasure_denied" })
    );
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "data.erased",
        targetId: STUDENT.id,
        metadata: expect.objectContaining({ requestedBy: "holder" }),
      })
    );
    expect(trail).not.toContain(IMAGE_B64);
    expect(trail).not.toContain("070809");
    expect(trail).not.toContain("1.31");
    expect(trail).not.toContain("0.97");
  });
});
