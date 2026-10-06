/**
 * EnrollmentService
 * Cadastro biométrico no totem — identificação do aluno, consentimento LGPD,
 * captura multi-frame e consolidação de embedding.
 *
 * Fluxo:
 *   1. Aluno digita o identificador no totem (CPF ou matrícula, conforme
 *      tenant_settings). `lookup` confirma o nome sem abrir sessão.
 *   2. `start` abre a sessão de cadastro, que vive no Redis com TTL de 10min.
 *      Se expirar, o próximo request falha com ENROLLMENT_SESSION_EXPIRED.
 *   3. Consentimento LGPD registrado em biometric_consents antes de qualquer
 *      captura (quando requireConsentBeforeFacial está ligado).
 *   4. Frames passam pela engine com pipeline rigoroso (det ≥ 0.75 na foto
 *      frontal e 0.68 nas viradas — ver utils/enrollmentPose —, mais
 *      liveness_threshold_enrollment). Embeddings retornam cifrados.
 *   5. Finalize: engine calcula média vetorial + L2 e devolve o embedding
 *      consolidado cifrado, persistido em facial_embeddings.
 *
 * O caminho inverso também mora aqui: o próprio aluno pode apagar a biometria
 * no totem (lookupForErasure / confirmErasure), com a mesma identificação por
 * CPF ou matrícula — mas quem autoriza a exclusão é o rosto, não o número.
 */

import crypto from "crypto";
import { BaseService } from "./base.service";
import { redis } from "../lib/redis";
import { NotFoundError, ValidationError } from "../utils/errors";
import { getTenantDekPayload, getCandidatesForUser } from "./facial-payload";
import {
  resolveIdentification,
  totemIdentifierLabel,
  type IdentificationPolicy,
} from "../utils/identification";
import {
  engineEnrollFrame,
  engineEnrollFinalize,
  engineInvalidateEmbedding,
  engineRecognize,
  type RecognizeThresholds,
} from "../lib/faceEngine";
import { auditService } from "./audit.service";
import { usersService } from "./users.service";
import { enrollmentPose, enrollmentDetScoreMin } from "../utils/enrollmentPose";

// Versão do texto de consentimento LGPD exibido no totem (rastreabilidade)
export const CONSENT_TEXT_VERSION = "v1.0";

const SESSION_TTL_SECONDS = 600; // 10 minutos
const SESSION_KEY_PREFIX = "enroll:session:";

// Exclusão pelo titular: confirmações faciais recusadas até bloquear a
// exclusão daquele aluno — em qualquer totem — pela janela abaixo
const ERASURE_MAX_FAILURES = 3;
const ERASURE_LOCK_SECONDS = 15 * 60;
const ERASURE_FAILURES_PREFIX = "erase:failures:";

// ── DTOs ─────────────────────────────────────────────────────────────────────

interface EnrollmentSession {
  tenantId: string;
  userId: string;
  /** Nome do aluno, para rotular os eventos de auditoria sem ida ao banco. */
  userName: string;
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

export interface EnrollmentSessionOutput {
  sessionId: string;
  student: { id: string; name: string };
  requiresConsent: boolean;
  requiredFrames: number;
  consentTextVersion: string;
  expiresInSeconds: number;
}

export interface LookupStudentOutput {
  name: string;
  /** Ausente quando a instituição não registra CPF. */
  document?: string;
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

export interface ErasureLookupOutput {
  /** Só o primeiro nome: contra o cadastro errado, quem protege é o rosto. */
  firstName: string;
}

export interface ErasureConfirmOutput {
  erased: boolean;
  /** Por que não apagou — o totem orienta o aluno a partir daqui. */
  reason?: "no_face_detected" | "multiple_faces_detected" | "face_mismatch" | "liveness_failed";
  /** Confirmações que ainda restam antes do bloqueio temporário. */
  attemptsLeft?: number;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class EnrollmentService extends BaseService {
  // ── Fluxo do totem (X-Device-Key) ──────────────────────────────────────────

  /** O cadastro no totem só roda em dispositivos com "permitir cadastro". */
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
   * Localiza o aluno pelo que a instituição pede no totem: CPF, matrícula
   * interna ou qualquer um dos dois.
   *
   * O CPF é casado com e sem máscara — o cadastro do painel pode ter salvo em
   * qualquer um dos formatos. A matrícula é comparada sem diferenciar
   * maiúsculas (o aluno digita "2026a12" no lugar de "2026A12").
   */
  private async findStudentByIdentifier(
    tenantId: string,
    identifier: string,
    policy: IdentificationPolicy
  ) {
    const value = identifier.trim();
    const digits = value.replace(/\D/g, "");
    const acceptsCpf = policy.totemIdentification !== "enrollment_code";
    const acceptsCode = policy.totemIdentification !== "cpf";

    const or: Array<Record<string, unknown>> = [];

    if (acceptsCpf && digits.length === 11) {
      const masked = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
      or.push({ document: { in: [digits, masked, value] } });
    }
    if (acceptsCode && value.length > 0) {
      or.push({ enrollmentCode: { equals: value, mode: "insensitive" as const } });
    }

    if (or.length === 0) {
      throw new ValidationError(
        `Informe um ${totemIdentifierLabel(policy.totemIdentification)} válido`,
        "INVALID_IDENTIFIER"
      );
    }

    // take: 2 detecta matrícula repetida em base importada — escolher um dos
    // dois alunos em silêncio cadastraria a biometria na pessoa errada
    const students = await this.prisma.user.findMany({
      where: { tenantId, role: "student", OR: or },
      select: { id: true, name: true, document: true, enrollmentCode: true, facialStatus: true },
      take: 2,
    });

    if (students.length === 0) {
      throw new NotFoundError(
        `Nenhum aluno encontrado com este ${totemIdentifierLabel(policy.totemIdentification)}`
      );
    }
    if (students.length > 1) {
      throw new ValidationError(
        "Mais de um aluno com este identificador. Procure a secretaria.",
        "AMBIGUOUS_IDENTIFIER"
      );
    }
    return students[0];
  }

  /** Política de identificação do tenant, já normalizada. */
  private async loadIdentificationPolicy(tenantId: string): Promise<IdentificationPolicy> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        studentIdentification: true,
        totemIdentification: true,
        validateCpf: true,
      },
    });
    return resolveIdentification(settings);
  }

  /** Passo de confirmação de identidade no totem — não abre sessão ainda. */
  async lookupByIdentifier(
    tenantId: string,
    deviceId: string,
    identifier: string
  ): Promise<LookupStudentOutput> {
    await this.assertEnrollmentAllowed(tenantId, deviceId);
    const policy = await this.loadIdentificationPolicy(tenantId);
    const student = await this.findStudentByIdentifier(tenantId, identifier, policy);
    return {
      name: student.name,
      document: student.document ?? undefined,
      enrollmentCode: student.enrollmentCode ?? undefined,
      facialStatus: student.facialStatus,
    };
  }

  /**
   * Abre a sessão de cadastro para o aluno já confirmado no `lookup`.
   * A partir daqui, consent/frame/finalize operam sobre o sessionId.
   */
  async startByIdentifier(
    tenantId: string,
    deviceId: string,
    identifier: string
  ): Promise<EnrollmentSessionOutput> {
    await this.assertEnrollmentAllowed(tenantId, deviceId);
    const policy = await this.loadIdentificationPolicy(tenantId);
    const student = await this.findStudentByIdentifier(tenantId, identifier, policy);

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const requiresConsent = settings?.requireConsentBeforeFacial ?? true;
    const requiredFrames = settings?.enrollmentMultiFrameCount ?? 3;
    // Clamp [0.5, 0.95]: calibração ruim não pode inviabilizar o cadastro
    const livenessThresholdEnrollment = this.clampLiveness(
      settings?.livenessThresholdEnrollment ?? 0.9
    );

    const sessionId = crypto.randomBytes(16).toString("hex");
    const session: EnrollmentSession = {
      tenantId,
      userId: student.id,
      userName: student.name,
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
      "Enrollment session opened (identifier flow)"
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

    // Prova de que houve aceite formal antes de qualquer captura facial: quem
    // consentiu, em qual totem, de qual IP e sob qual versão do texto (LGPD).
    auditService.record({
      action: "consent.granted",
      tenantId,
      targetId: session.userId,
      targetLabel: session.userName,
      beforeState: { facialStatus: "none", consent: false },
      afterState: { facialStatus: "consent_given", consent: true },
      changedFields: ["facialStatus", "consent"],
      details: `${session.userName} aceitou o termo de consentimento biométrico (versão ${CONSENT_TEXT_VERSION})`,
      metadata: {
        consentTextVersion: CONSENT_TEXT_VERSION,
        deviceFingerprint,
        // IP capturado pelo próprio fluxo do totem, que pode diferir do IP da
        // requisição quando o totem faz proxy do navegador do aluno
        consentIpAddress: ipAddress,
      },
    });

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

    auditService.record({
      action: "consent.refused",
      tenantId,
      targetId: session.userId,
      targetLabel: session.userName,
      afterState: { facialStatus: "consent_refused", consent: false },
      changedFields: ["facialStatus"],
      details: `${session.userName} recusou o termo de consentimento biométrico`,
      metadata: { consentTextVersion: CONSENT_TEXT_VERSION },
    });

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

    const pose = enrollmentPose(session.frames.length);
    const detectionScoreMin = enrollmentDetScoreMin(session.frames.length);

    const result = await engineEnrollFrame({
      tenantId,
      imageJpeg,
      dek,
      livenessThresholdEnrollment: session.livenessThresholdEnrollment,
      detectionScoreMin,
    });

    if (result.status !== "frame_accepted" || !result.embedding_iv || !result.embedding_tag || !result.embedding_ct) {
      // Score medido x corte, por pose — base para recalibrar os mínimos
      // com dados reais das escolas
      this.logger.info(
        {
          tenantId,
          userId: session.userId,
          frameIndex: session.frames.length,
          pose,
          reason: result.status,
          detectionScore: result.detection_score ?? null,
          detectionScoreMin,
          livenessScore: result.liveness_score ?? null,
        },
        "Enrollment frame rejected"
      );
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

    auditService.record({
      action: "biometrics.registered",
      tenantId,
      targetId: session.userId,
      targetLabel: session.userName,
      beforeState: { facialStatus: "consent_given" },
      afterState: { facialStatus: "registered" },
      changedFields: ["facialStatus"],
      details: `Biometria facial de ${session.userName} cadastrada e cifrada`,
      metadata: {
        modelVersion: consolidated.model_version,
        framesUsed: consolidated.frames_used,
        keyVersion: consolidated.key_version,
        // O embedding em si jamais entra na trilha — só o registro de que foi
        // gerado. O vetor facial vive cifrado em facial_embeddings.
      },
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

  // ── Exclusão da biometria pelo próprio titular (X-Device-Key) ─────────────
  //
  // O identificador digitado só aponta QUAL cadastro apagar; quem autoriza é o
  // rosto. A exclusão acontece apenas quando um reconhecimento feito naquele
  // instante confere com a biometria guardada desse mesmo aluno (1:1, com a
  // vivacidade no rigor do cadastro). CPF ou matrícula de outra pessoa, sem o
  // rosto dela, não apaga nada.

  /** Passo de confirmação: acha o cadastro e garante que há o que apagar. */
  async lookupForErasure(tenantId: string, identifier: string): Promise<ErasureLookupOutput> {
    const { student } = await this.findErasureTarget(tenantId, identifier);
    return { firstName: student.name.trim().split(/\s+/)[0] };
  }

  /**
   * Confere o rosto contra a biometria do próprio aluno e, só se conferir,
   * apaga tudo numa transação (usersService.eraseUserData — a mesma exclusão
   * que o admin faz pelo console).
   *
   * Falha de enquadramento (sem rosto, mais de um) não conta como tentativa.
   * Rosto que não confere ou reprovado na vivacidade conta: depois de
   * ERASURE_MAX_FAILURES, a exclusão desse aluno fica bloqueada em qualquer
   * totem por ERASURE_LOCK_SECONDS — teto para quem tenta a sorte com o CPF
   * de outra pessoa.
   */
  async confirmErasure(
    tenantId: string,
    deviceId: string,
    identifier: string,
    imageB64: string
  ): Promise<ErasureConfirmOutput> {
    const { student, candidates } = await this.findErasureTarget(tenantId, identifier);
    const imageJpeg = this.decodeImage(imageB64);

    const [dek, thresholds] = await Promise.all([
      getTenantDekPayload(tenantId),
      this.erasureThresholds(tenantId, deviceId),
    ]);

    const result = await engineRecognize({ tenantId, imageJpeg, dek, candidates, thresholds });

    if (result.status === "no_face_detected" || result.status === "multiple_faces_detected") {
      return { erased: false, reason: result.status };
    }

    // A lista tem um único dono, então "identified" já quer dizer "é ele" —
    // conferir o id é a trava contra qualquer surpresa vinda da engine
    const confirmed =
      result.status === "identified" && String(result.person_id) === student.id;

    if (!confirmed) {
      const reason = result.status === "liveness_failed" ? "liveness_failed" : "face_mismatch";
      const attemptsLeft = await this.registerErasureFailure(tenantId, student.id);

      // Tentativa contra a biometria de alguém é o que a instituição precisa
      // enxergar primeiro. Só o desfecho entra na trilha: nem imagem nem score.
      auditService.record({
        action: "data.erasure_denied",
        status: "failure",
        tenantId,
        targetId: student.id,
        targetLabel: student.name,
        details:
          reason === "liveness_failed"
            ? `Pedido de exclusão da biometria de ${student.name} recusado: o totem não confirmou uma pessoa real diante da câmera. Nenhum dado foi apagado.`
            : `Pedido de exclusão da biometria de ${student.name} recusado: o rosto não confere com o cadastro. Nenhum dado foi apagado.`,
        metadata: { reason, attemptsLeft },
      });

      this.logger.warn(
        { tenantId, deviceId, userId: student.id, reason, attemptsLeft },
        "Biometric erasure denied — face not confirmed"
      );
      return { erased: false, reason, attemptsLeft };
    }

    await usersService.eraseUserData(student.id, tenantId, student.id, {
      details: `Dados biométricos de ${student.name} excluídos a pedido do próprio titular, no totem, com a identidade confirmada por reconhecimento facial (direito de eliminação, LGPD art. 18)`,
      metadata: { requestedBy: "holder", identityCheck: "facial_recognition" },
    });
    // Os dados já foram apagados: falhar aqui não pode virar erro para o
    // aluno. Sem biometria, o contador não serve mais e expira sozinho.
    await redis.del(this.erasureFailuresKey(tenantId, student.id)).catch((error) => {
      this.logger.warn({ tenantId, userId: student.id, error }, "Failed to reset erasure failures");
    });

    this.logger.info({ tenantId, deviceId, userId: student.id }, "Biometric data erased by holder");
    return { erased: true };
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Aluno dono do identificador, com a biometria dele já no formato da engine.
   * Barra antes de qualquer captura quem não tem o que apagar ou está
   * bloqueado por confirmações recusadas.
   */
  private async findErasureTarget(tenantId: string, identifier: string) {
    const policy = await this.loadIdentificationPolicy(tenantId);
    const student = await this.findStudentByIdentifier(tenantId, identifier, policy);
    await this.assertErasureNotLocked(tenantId, student.id);

    const candidates = await getCandidatesForUser(tenantId, student.id);
    if (candidates.length === 0) {
      throw new NotFoundError(
        "Não há dados biométricos cadastrados para este aluno",
        "NO_BIOMETRIC_DATA"
      );
    }
    return { student, candidates };
  }

  /**
   * Limiares da confirmação: reconhecimento igual ao da chamada neste totem
   * (calibrado ou o da instituição) e vivacidade nunca abaixo do rigor do
   * cadastro — apagar a biometria é tão sensível quanto criá-la.
   */
  private async erasureThresholds(
    tenantId: string,
    deviceId: string
  ): Promise<RecognizeThresholds> {
    const [settings, device] = await Promise.all([
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: {
          recognitionThreshold: true,
          livenessThreshold: true,
          livenessThresholdEnrollment: true,
        },
      }),
      this.prisma.device.findFirst({
        where: { id: deviceId, tenantId },
        select: { recognitionThreshold: true, livenessThreshold: true },
      }),
    ]);

    return {
      recognitionThreshold: device?.recognitionThreshold ?? settings?.recognitionThreshold,
      livenessThreshold: Math.max(
        this.clampLiveness(device?.livenessThreshold ?? settings?.livenessThreshold ?? 0.85),
        this.clampLiveness(settings?.livenessThresholdEnrollment ?? 0.9)
      ),
    };
  }

  /** Faixa operável [0.5, 0.95]: calibração ruim não trava o fluxo nem desliga o antifraude. */
  private clampLiveness(value: number): number {
    return Math.min(0.95, Math.max(0.5, value));
  }

  private erasureFailuresKey(tenantId: string, userId: string): string {
    return `${ERASURE_FAILURES_PREFIX}${tenantId}:${userId}`;
  }

  private async assertErasureNotLocked(tenantId: string, userId: string): Promise<void> {
    const failures = Number((await redis.get(this.erasureFailuresKey(tenantId, userId))) ?? 0);
    if (failures >= ERASURE_MAX_FAILURES) {
      throw new ValidationError(
        `Muitas tentativas sem confirmar a identidade. Tente de novo em ${ERASURE_LOCK_SECONDS / 60} minutos ou procure a secretaria.`,
        "ERASURE_LOCKED"
      );
    }
  }

  /** Conta a confirmação recusada e devolve quantas ainda restam. */
  private async registerErasureFailure(tenantId: string, userId: string): Promise<number> {
    const key = this.erasureFailuresKey(tenantId, userId);
    // SET NX antes do INCR: a janela começa na primeira recusa e o contador
    // nunca fica sem TTL (um INCR solto criaria a chave sem expiração)
    await redis.set(key, "0", { NX: true, EX: ERASURE_LOCK_SECONDS });
    const failures = await redis.incr(key);
    return Math.max(0, ERASURE_MAX_FAILURES - failures);
  }

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
