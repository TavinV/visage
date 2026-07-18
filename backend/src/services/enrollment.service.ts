/**
 * EnrollmentService
 * Cadastro biométrico via QR Code — token de uso único, consentimento LGPD,
 * captura multi-frame e consolidação de embedding.
 *
 * Fluxo:
 *   1. Admin gera token (só o hash SHA-256 é persistido; o token bruto
 *      existe apenas na resposta da geração).
 *   2. Totem valida token — invalidação ATÔMICA via updateMany com
 *      status='pending' no where (duas leituras concorrentes: só uma vence).
 *   3. Sessão de cadastro vive no Redis com TTL de 10min. Se expirar, o
 *      próximo request falha com ENROLLMENT_SESSION_EXPIRED.
 *   4. Frames passam pela engine com pipeline rigoroso (det ≥ 0.85,
 *      liveness_threshold_enrollment). Embeddings retornam cifrados.
 *   5. Finalize: engine calcula média vetorial + L2 e devolve o embedding
 *      consolidado cifrado, persistido em facial_embeddings.
 */

import crypto from "crypto";
import { BaseService } from "./base.service";
import { redis } from "../lib/redis";
import { NotFoundError, ValidationError } from "../utils/errors";
import { getTenantDekPayload } from "./facial-payload";
import {
  engineEnrollFrame,
  engineEnrollFinalize,
  engineInvalidateEmbedding,
} from "../lib/faceEngine";

// Versão do texto de consentimento LGPD exibido no totem (rastreabilidade)
export const CONSENT_TEXT_VERSION = "v1.0";

const SESSION_TTL_SECONDS = 600; // 10 minutos
const SESSION_KEY_PREFIX = "enroll:session:";

// ── DTOs ─────────────────────────────────────────────────────────────────────

interface EnrollmentSession {
  tenantId: string;
  userId: string;
  deviceId: string;
  step: "consent" | "capture";
  requiredFrames: number;
  livenessThresholdEnrollment: number;
  frames: Array<{
    embedding_iv: string;
    embedding_tag: string;
    embedding_ct: string;
  }>;
}

export interface GenerateTokenOutput {
  token: string; // token bruto — única vez que existe fora do hash
  expiresAt: Date;
}

export interface TokenStatusOutput {
  status: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

export interface ValidateTokenOutput {
  sessionId: string;
  student: { id: string; name: string };
  requiresConsent: boolean;
  requiredFrames: number;
  consentTextVersion: string;
  expiresInSeconds: number;
}

export interface LookupStudentOutput {
  name: string;
  document: string;
  enrollmentCode?: string;
  facialStatus: string;
}

export interface FrameResultOutput {
  accepted: boolean;
  reason?: string;
  livenessScore?: number;
  framesCollected: number;
  requiredFrames: number;
  completed: boolean;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class EnrollmentService extends BaseService {
  // ── Gestão de tokens (painel — JWT admin/manager) ──────────────────────────

  async generateToken(
    tenantId: string,
    studentId: string,
    createdById: string
  ): Promise<GenerateTokenOutput> {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, role: true, facialStatus: true },
    });
    if (!student) throw new NotFoundError("Student not found in this tenant");
    if (student.role !== "student") {
      throw new ValidationError("Enrollment tokens can only be issued for students", "NOT_A_STUDENT");
    }

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const expiryHours = settings?.enrollmentTokenExpiryHours ?? 72;

    // Um único token pendente por aluno — revoga anteriores
    await this.prisma.enrollmentToken.updateMany({
      where: { tenantId, userId: studentId, status: "pending" },
      data: { status: "revoked" },
    });

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await this.prisma.enrollmentToken.create({
      data: { tenantId, userId: studentId, tokenHash, status: "pending", expiresAt, createdById },
    });

    this.logger.info({ tenantId, studentId, expiresAt }, "Enrollment token generated");
    return { token, expiresAt };
  }

  async getTokenStatus(tenantId: string, studentId: string): Promise<TokenStatusOutput> {
    const row = await this.prisma.enrollmentToken.findFirst({
      where: { tenantId, userId: studentId },
      orderBy: { createdAt: "desc" },
    });
    if (!row) throw new NotFoundError("No enrollment token found for this student");

    const effectiveStatus =
      row.status === "pending" && row.expiresAt < new Date() ? "expired" : row.status;

    return {
      status: effectiveStatus,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      usedAt: row.usedAt ?? undefined,
    };
  }

  async revokeToken(tenantId: string, studentId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.enrollmentToken.updateMany({
      where: { tenantId, userId: studentId, status: "pending" },
      data: { status: "revoked" },
    });
    this.logger.info({ tenantId, studentId, revoked: result.count }, "Enrollment token revoked");
    return { revoked: result.count };
  }

  // ── Fluxo do totem (X-Device-Key) ──────────────────────────────────────────

  async validateToken(
    tenantId: string,
    deviceId: string,
    token: string,
    deviceFingerprint: string
  ): Promise<ValidateTokenOutput> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    // Invalidação atômica: o filtro status='pending' garante que apenas UMA
    // requisição concorrente consome o token (count === 1); as demais veem 0.
    const consumed = await this.prisma.enrollmentToken.updateMany({
      where: { tokenHash, tenantId, status: "pending", expiresAt: { gt: now } },
      data: { status: "used", usedAt: now, usedByDevice: deviceFingerprint },
    });

    if (consumed.count === 0) {
      // Diagnóstico do motivo (sem alterar o resultado da corrida)
      const existing = await this.prisma.enrollmentToken.findFirst({
        where: { tokenHash, tenantId },
        select: { status: true, expiresAt: true },
      });
      if (!existing) throw new ValidationError("Token inválido", "TOKEN_INVALID");
      if (existing.status === "used") throw new ValidationError("Token já utilizado", "TOKEN_ALREADY_USED");
      if (existing.status === "revoked") throw new ValidationError("Token revogado", "TOKEN_REVOKED");
      if (existing.expiresAt <= now) {
        await this.prisma.enrollmentToken.updateMany({
          where: { tokenHash, tenantId, status: "pending" },
          data: { status: "expired" },
        });
        throw new ValidationError("Token expirado", "TOKEN_EXPIRED");
      }
      throw new ValidationError("Token inválido", "TOKEN_INVALID");
    }

    const tokenRow = await this.prisma.enrollmentToken.findFirst({
      where: { tokenHash, tenantId },
      select: { userId: true },
    });
    if (!tokenRow) throw new NotFoundError("Token not found after consumption");

    const student = await this.prisma.user.findFirst({
      where: { id: tokenRow.userId, tenantId },
      select: { id: true, name: true },
    });
    if (!student) throw new NotFoundError("Student not found in this tenant");

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const requiresConsent = settings?.requireConsentBeforeFacial ?? true;
    const requiredFrames = settings?.enrollmentMultiFrameCount ?? 3;
    // Clamp [0.5, 0.95]: calibração ruim não pode inviabilizar o cadastro
    const livenessThresholdEnrollment = Math.min(
      0.95,
      Math.max(0.5, settings?.livenessThresholdEnrollment ?? 0.9)
    );

    const sessionId = crypto.randomBytes(16).toString("hex");
    const session: EnrollmentSession = {
      tenantId,
      userId: student.id,
      deviceId,
      step: requiresConsent ? "consent" : "capture",
      requiredFrames,
      livenessThresholdEnrollment,
      frames: [],
    };

    await redis.set(SESSION_KEY_PREFIX + sessionId, JSON.stringify(session), {
      EX: SESSION_TTL_SECONDS,
    });

    this.logger.info({ tenantId, userId: student.id, deviceId }, "Enrollment session opened");

    return {
      sessionId,
      student: { id: student.id, name: student.name },
      requiresConsent,
      requiredFrames,
      consentTextVersion: CONSENT_TEXT_VERSION,
      expiresInSeconds: SESSION_TTL_SECONDS,
    };
  }

  // ── Cadastro por documento (CPF digitado no totem) ─────────────────────────

  /** O fluxo por CPF só funciona em totens com "permitir cadastro" ligado. */
  private async assertEnrollmentAllowed(tenantId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { allowEnrollment: true },
    });
    if (!device?.allowEnrollment) {
      throw new ValidationError(
        "Este totem não está liberado para cadastro biométrico",
        "ENROLLMENT_NOT_ALLOWED"
      );
    }
  }

  /**
   * Localiza o aluno pelo documento aceitando o valor com ou sem máscara —
   * o cadastro do painel pode ter salvo em qualquer um dos formatos.
   */
  private async findStudentByDocument(tenantId: string, document: string) {
    const digits = document.replace(/\D/g, "");
    if (digits.length < 11) {
      throw new ValidationError("Documento inválido", "INVALID_DOCUMENT");
    }
    const masked = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

    const student = await this.prisma.user.findFirst({
      where: {
        tenantId,
        role: "student",
        document: { in: [digits, masked, document] },
      },
      select: { id: true, name: true, document: true, enrollmentCode: true, facialStatus: true },
    });
    if (!student) {
      throw new NotFoundError("Nenhum aluno encontrado com este CPF");
    }
    return student;
  }

  /** Passo de confirmação de identidade no totem — não abre sessão ainda. */
  async lookupByDocument(
    tenantId: string,
    deviceId: string,
    document: string
  ): Promise<LookupStudentOutput> {
    await this.assertEnrollmentAllowed(tenantId, deviceId);
    const student = await this.findStudentByDocument(tenantId, document);
    return {
      name: student.name,
      document: student.document ?? document,
      enrollmentCode: student.enrollmentCode ?? undefined,
      facialStatus: student.facialStatus,
    };
  }

  /**
   * Abre uma sessão de cadastro para o aluno confirmado — mesmo formato da
   * sessão criada por token QR; consent/frame/finalize seguem inalterados.
   */
  async startByDocument(
    tenantId: string,
    deviceId: string,
    document: string
  ): Promise<ValidateTokenOutput> {
    await this.assertEnrollmentAllowed(tenantId, deviceId);
    const student = await this.findStudentByDocument(tenantId, document);

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const requiresConsent = settings?.requireConsentBeforeFacial ?? true;
    const requiredFrames = settings?.enrollmentMultiFrameCount ?? 3;
    // Clamp [0.5, 0.95]: calibração ruim não pode inviabilizar o cadastro
    const livenessThresholdEnrollment = Math.min(
      0.95,
      Math.max(0.5, settings?.livenessThresholdEnrollment ?? 0.9)
    );

    const sessionId = crypto.randomBytes(16).toString("hex");
    const session: EnrollmentSession = {
      tenantId,
      userId: student.id,
      deviceId,
      step: requiresConsent ? "consent" : "capture",
      requiredFrames,
      livenessThresholdEnrollment,
      frames: [],
    };

    await redis.set(SESSION_KEY_PREFIX + sessionId, JSON.stringify(session), {
      EX: SESSION_TTL_SECONDS,
    });

    this.logger.info(
      { tenantId, userId: student.id, deviceId },
      "Enrollment session opened (document flow)"
    );

    return {
      sessionId,
      student: { id: student.id, name: student.name },
      requiresConsent,
      requiredFrames,
      consentTextVersion: CONSENT_TEXT_VERSION,
      expiresInSeconds: SESSION_TTL_SECONDS,
    };
  }

  async registerConsent(
    tenantId: string,
    sessionId: string,
    deviceFingerprint: string,
    ipAddress: string
  ): Promise<{ step: string }> {
    const session = await this.loadSession(tenantId, sessionId);
    if (session.step !== "consent") {
      throw new ValidationError("Sessão não está aguardando consentimento", "INVALID_ENROLLMENT_STEP");
    }

    await this.prisma.$transaction([
      this.prisma.biometricConsent.create({
        data: {
          tenantId,
          userId: session.userId,
          consentTextVersion: CONSENT_TEXT_VERSION,
          consentedAt: new Date(),
          deviceFingerprint,
          ipAddress,
          isActive: true,
        },
      }),
      this.prisma.user.updateMany({
        where: { id: session.userId, tenantId },
        data: { facialStatus: "consent_given" },
      }),
    ]);

    session.step = "capture";
    await this.saveSession(sessionId, session);

    this.logger.info({ tenantId, userId: session.userId }, "Biometric consent registered");
    return { step: "capture" };
  }

  async registerRefusal(tenantId: string, sessionId: string): Promise<void> {
    const session = await this.loadSession(tenantId, sessionId);

    // Recusa não cria embedding nem consentimento — apenas marca o estado
    await this.prisma.user.updateMany({
      where: { id: session.userId, tenantId, facialStatus: { in: ["none", "consent_given"] } },
      data: { facialStatus: "consent_refused" },
    });

    await redis.del(SESSION_KEY_PREFIX + sessionId);
    this.logger.info({ tenantId, userId: session.userId }, "Biometric consent refused");
  }

  async processFrame(
    tenantId: string,
    sessionId: string,
    imageB64: string
  ): Promise<FrameResultOutput> {
    const session = await this.loadSession(tenantId, sessionId);
    if (session.step !== "capture") {
      throw new ValidationError("Consentimento pendente para esta sessão", "INVALID_ENROLLMENT_STEP");
    }
    if (session.frames.length >= session.requiredFrames) {
      throw new ValidationError("Todos os frames já foram capturados", "ENROLLMENT_FRAMES_COMPLETE");
    }

    const imageJpeg = this.decodeImage(imageB64);
    const dek = await getTenantDekPayload(tenantId);

    const result = await engineEnrollFrame({
      tenantId,
      imageJpeg,
      dek,
      livenessThresholdEnrollment: session.livenessThresholdEnrollment,
    });

    if (result.status !== "frame_accepted" || !result.embedding_iv || !result.embedding_tag || !result.embedding_ct) {
      // Frame rejeitado — totem exibe feedback vermelho e re-tenta
      return {
        accepted: false,
        reason: result.status,
        livenessScore: result.liveness_score ?? undefined,
        framesCollected: session.frames.length,
        requiredFrames: session.requiredFrames,
        completed: false,
      };
    }

    session.frames.push({
      embedding_iv: result.embedding_iv,
      embedding_tag: result.embedding_tag,
      embedding_ct: result.embedding_ct,
    });
    await this.saveSession(sessionId, session);

    return {
      accepted: true,
      livenessScore: result.liveness_score ?? undefined,
      framesCollected: session.frames.length,
      requiredFrames: session.requiredFrames,
      completed: session.frames.length >= session.requiredFrames,
    };
  }

  async finalize(
    tenantId: string,
    sessionId: string
  ): Promise<{ userId: string; modelVersion: string; framesUsed: number }> {
    const session = await this.loadSession(tenantId, sessionId);
    if (session.frames.length < session.requiredFrames) {
      throw new ValidationError(
        `Frames insuficientes: ${session.frames.length}/${session.requiredFrames}`,
        "ENROLLMENT_FRAMES_INCOMPLETE"
      );
    }

    const dek = await getTenantDekPayload(tenantId);
    const consolidated = await engineEnrollFinalize({
      tenantId,
      dek,
      frames: session.frames,
    });

    // Upsert do embedding consolidado (um por user + model_version)
    await this.prisma.$transaction([
      this.prisma.facialEmbedding.deleteMany({
        where: { tenantId, userId: session.userId, modelVersion: consolidated.model_version },
      }),
      this.prisma.facialEmbedding.create({
        data: {
          tenantId,
          userId: session.userId,
          embeddingIv: Buffer.from(consolidated.embedding_iv, "hex"),
          embeddingTag: Buffer.from(consolidated.embedding_tag, "hex"),
          embeddingCt: Buffer.from(consolidated.embedding_ct, "hex"),
          keyVersion: consolidated.key_version,
          modelVersion: consolidated.model_version,
        },
      }),
      this.prisma.user.updateMany({
        where: { id: session.userId, tenantId },
        data: { facialStatus: "registered" },
      }),
    ]);

    await redis.del(SESSION_KEY_PREFIX + sessionId);

    // Cache da engine pode ter embedding antigo — invalidar (não-fatal)
    engineInvalidateEmbedding(tenantId, session.userId).catch((error) => {
      this.logger.warn({ tenantId, userId: session.userId, error }, "Failed to invalidate engine cache");
    });

    this.logger.info(
      { tenantId, userId: session.userId, framesUsed: consolidated.frames_used },
      "Enrollment finalized — embedding registered"
    );

    return {
      userId: session.userId,
      modelVersion: consolidated.model_version,
      framesUsed: consolidated.frames_used,
    };
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async loadSession(tenantId: string, sessionId: string): Promise<EnrollmentSession> {
    const raw = await redis.get(SESSION_KEY_PREFIX + sessionId);
    if (!raw) {
      throw new ValidationError(
        "Sessão de cadastro expirada ou inexistente",
        "ENROLLMENT_SESSION_EXPIRED"
      );
    }

    const session = JSON.parse(raw) as EnrollmentSession;

    // Guard cross-tenant: sessão só é utilizável por totem do mesmo tenant
    if (session.tenantId !== tenantId) {
      throw new ValidationError(
        "Sessão de cadastro expirada ou inexistente",
        "ENROLLMENT_SESSION_EXPIRED"
      );
    }

    return session;
  }

  private async saveSession(sessionId: string, session: EnrollmentSession): Promise<void> {
    // KEEPTTL: a sessão expira 10min após a criação, independente de atividade
    await redis.set(SESSION_KEY_PREFIX + sessionId, JSON.stringify(session), {
      KEEPTTL: true,
    });
  }

  private decodeImage(imageB64: string): Buffer {
    const stripped = imageB64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(stripped, "base64");
    if (buffer.length === 0) {
      throw new ValidationError("Imagem vazia ou base64 inválido", "INVALID_IMAGE");
    }
    if (buffer.length > 1024 * 1024) {
      throw new ValidationError("Imagem excede 1MB", "IMAGE_TOO_LARGE");
    }
    return buffer;
  }
}

export const enrollmentService = new EnrollmentService();
