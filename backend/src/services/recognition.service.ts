/**
 * RecognitionService — hot path do reconhecimento facial via totem.
 *
 * Fluxo:
 *   1. Middleware deviceAuth já validou X-Device-Key → tenantId/deviceId.
 *   2. Resolve sessão de chamada aberta para a localização do totem.
 *   3. Sem sessão + pre_attendance_enabled → registra pré-presença (SET NX).
 *   4. Com sessão → envia frame + DEK cifrada + candidatos à engine.
 *   5. recognition_logs é SEMPRE persistido.
 *   6. identified → attendance_records idempotente (skipDuplicates).
 *   7. Eventos SSE para painel do professor e totem.
 *   8. Resposta mínima ao totem — nunca embeddings.
 */

import fs from "fs/promises";
import path from "path";
import { BaseService } from "./base.service";
import { ValidationError } from "../utils/errors";
import { redis } from "../lib/redis";
import { config } from "../lib/config";
import { engineRecognize } from "../lib/faceEngine";
import { getTenantDekPayload, getCandidatesForClass, getCandidatesForLocation } from "./facial-payload";
import { lessonsCompletedOnCheckout } from "./class-sessions.service";
import { sseService } from "./sse.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface RecognizeDeviceInput {
  tenantId: string;
  deviceId: string;
  locationId?: string;
  imageB64: string;
}

export interface RecognizeDeviceOutput {
  status: string;
  personName?: string;
  confidence?: number;
  preAttendance?: boolean;
  /** Este reconhecimento registrou a SAÍDA do aluno, não a entrada. */
  checkout?: boolean;
  /** Aulas cumpridas até a saída — o totem mostra na confirmação. */
  classesCounted?: number;
}

export interface CurrentSessionOutput {
  id: string;
  classId: string;
  className: string;
  startedAt: Date;
  classesWorth: number;
  scheduledEndsAt?: Date;
}

interface ActiveSession {
  id: string;
  classId: string;
  className: string;
  startedAt: Date;
  classesWorth: number;
  lessonDurationMin: number;
  scheduledEndsAt: Date | null;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class RecognitionService extends BaseService {
  /**
   * POST /device/recognize — hot path.
   */
  async recognize(input: RecognizeDeviceInput): Promise<RecognizeDeviceOutput> {
    const { tenantId, deviceId, locationId } = input;

    const [settings, device] = await Promise.all([
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      // Calibração é por totem: câmera e iluminação mudam de sala para sala
      this.prisma.device.findUnique({
        where: { id: deviceId },
        select: { recognitionThreshold: true, livenessThreshold: true, livenessEnabled: true },
      }),
    ]);

    const session = await this.findActiveSession(tenantId, locationId);
    const preAttendanceMode = !session && (settings?.preAttendanceEnabled ?? false);

    if (!session && !preAttendanceMode) {
      return { status: "no_active_session" };
    }
    if (preAttendanceMode && !locationId) {
      // pre_attendances exige location — totem sem localização não participa
      return { status: "no_active_session" };
    }

    const imageJpeg = this.decodeImage(input.imageB64);

    const [dek, candidates] = await Promise.all([
      getTenantDekPayload(tenantId),
      session
        ? getCandidatesForClass(tenantId, session.classId)
        : getCandidatesForLocation(tenantId, locationId),
    ]);

    // Threshold do totem quando calibrado; senão, o do tenant
    const recognitionThreshold =
      device?.recognitionThreshold ?? settings?.recognitionThreshold;
    // Calibração com poucas amostras pode gravar um threshold de liveness
    // absurdo (ex.: 0.99) que bloqueia rostos reais em câmeras ruins —
    // o clamp garante uma faixa operável sem desligar o anti-spoofing
    const livenessThreshold = this.clampLiveness(
      tenantId,
      device?.livenessThreshold ?? settings?.livenessThreshold
    );

    const engineResult = await engineRecognize({
      tenantId,
      imageJpeg,
      dek,
      candidates,
      thresholds: {
        recognitionThreshold,
        livenessThreshold,
      },
    });

    const status = this.mapEngineStatus(engineResult.status);

    // Log por camada do anti-spoofing — base do debug de falsos positivos
    this.logger.info(
      {
        tenantId,
        deviceId,
        status,
        detScore: engineResult.detection_score_raw,
        livenessV1: engineResult.liveness_v1_raw,
        livenessV2: engineResult.liveness_v2_raw,
        livenessCombined: engineResult.liveness_combined_raw,
        livenessThreshold: livenessThreshold ?? 0.85,
        saturationMean: engineResult.saturation_mean,
        saturationStd: engineResult.saturation_std,
        bestDistance: engineResult.best_distance_raw,
        recognitionThreshold: recognitionThreshold ?? 1.1,
        deviceCalibrated: device?.recognitionThreshold != null,
        candidates: candidates.length,
        processingMs: engineResult.processing_ms,
      },
      "Engine recognize result"
    );
    const personId =
      engineResult.person_id !== null && engineResult.person_id !== undefined
        ? String(engineResult.person_id)
        : undefined;
    const livenessScore = engineResult.liveness_combined_raw ?? undefined;
    const confidence = engineResult.confidence ?? undefined;

    // recognition_logs é persistido SEMPRE, qualquer que seja o resultado
    const log = await this.prisma.recognitionLog.create({
      data: {
        tenantId,
        deviceId,
        userId: personId,
        status,
        confidence,
        livenessScore,
        saturationMean: engineResult.saturation_mean ?? undefined,
        processingMs: engineResult.processing_ms,
      },
    });

    // Camada 4 anti-spoofing: fraud frame (fire-and-forget, fora do hot path)
    if (status === "liveness_failed" && (settings?.saveFraudFrames ?? true)) {
      void this.saveFraudFrame(tenantId, log.id, imageJpeg);
    }

    if (status !== "identified" || !personId) {
      sseService.broadcast(sseService.deviceChannel(tenantId, deviceId), "recognition", {
        status,
      });
      return { status };
    }

    const person = await this.prisma.user.findFirst({
      where: { id: personId, tenantId },
      select: { id: true, name: true },
    });
    const personName = person?.name ?? "Aluno";

    if (session) {
      // Aluno com saída liberada pelo professor: este reconhecimento é a
      // SAÍDA, não uma segunda entrada
      if (settings?.individualCheckoutEnabled) {
        const checkout = await this.tryRegisterCheckout(
          tenantId,
          deviceId,
          session,
          personId,
          personName
        );
        if (checkout) return { status, personName, confidence, ...checkout };
      }

      await this.registerAttendance(tenantId, deviceId, session, personId, personName, {
        confidence,
        livenessScore,
      });
      return { status, personName, confidence };
    }

    // Pré-presença (sem sessão ativa)
    const registered = await this.registerPreAttendance(
      tenantId,
      locationId as string,
      personId,
      { confidence: confidence ?? 0, livenessScore: livenessScore ?? 0 },
      settings?.preAttendanceWindowMin ?? 30
    );

    sseService.broadcast(sseService.deviceChannel(tenantId, deviceId), "recognition", {
      status,
      personName,
      preAttendance: true,
    });

    return { status, personName, confidence, preAttendance: registered };
  }

  /**
   * GET /device/session/current — sessão aberta vinculada à sala do totem.
   */
  async getCurrentSession(
    tenantId: string,
    locationId?: string
  ): Promise<CurrentSessionOutput | null> {
    const session = await this.findActiveSession(tenantId, locationId);
    if (!session) return null;
    return {
      id: session.id,
      classId: session.classId,
      className: session.className,
      startedAt: session.startedAt,
      classesWorth: session.classesWorth,
      scheduledEndsAt: session.scheduledEndsAt ?? undefined,
    };
  }

  /**
   * GET /device/heartbeat — atualiza devices.last_seen_at.
   */
  async heartbeat(tenantId: string, deviceId: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { id: deviceId, tenantId },
      data: { lastSeenAt: new Date() },
    });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /** Faixa operável do threshold de liveness: [0.5, 0.95]. */
  private clampLiveness(tenantId: string, value?: number | null): number | undefined {
    if (value === undefined || value === null) return undefined;
    const clamped = Math.min(0.95, Math.max(0.5, value));
    if (clamped !== value) {
      this.logger.warn(
        { tenantId, configured: value, clamped },
        "Liveness threshold fora da faixa operável — usando valor ajustado"
      );
    }
    return clamped;
  }

  /**
   * Sessão aberta para a localização do totem. A sala EFETIVA da sessão é a
   * escolhida pelo professor ao abrir (session.locationId) ou, na ausência,
   * a sala padrão da turma. Sem localização no totem, usa a sessão aberta
   * mais recente do tenant (MVP: totem "flutuante").
   */
  private async findActiveSession(
    tenantId: string,
    locationId?: string
  ): Promise<ActiveSession | null> {
    const session = await this.prisma.classSession.findFirst({
      where: {
        tenantId,
        status: "open",
        // O job de fechamento roda a cada minuto; sem este filtro o totem
        // ainda aceitaria presença numa aula que já acabou
        OR: [{ scheduledEndsAt: null }, { scheduledEndsAt: { gt: new Date() } }],
        ...(locationId && {
          AND: [
            {
              OR: [
                { locationId },
                { locationId: null, classSubject: { class: { locationId } } },
              ],
            },
          ],
        }),
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        classesWorth: true,
        lessonDurationMin: true,
        scheduledEndsAt: true,
        classSubject: {
          select: {
            classId: true,
            subject: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
      },
    });

    if (!session) return null;

    return {
      id: session.id,
      classId: session.classSubject.classId,
      // O totem mostra a disciplina: a turma pode ter várias no mesmo dia
      className: `${session.classSubject.class.name} — ${session.classSubject.subject.name}`,
      startedAt: session.startedAt,
      classesWorth: session.classesWorth,
      lessonDurationMin: session.lessonDurationMin,
      scheduledEndsAt: session.scheduledEndsAt,
    };
  }

  private async registerAttendance(
    tenantId: string,
    deviceId: string,
    session: ActiveSession,
    userId: string,
    personName: string,
    scores: { confidence?: number; livenessScore?: number }
  ): Promise<void> {
    const recognizedAt = new Date();

    // Idempotente: @@unique(classSessionId, userId) + skipDuplicates =
    // INSERT ... ON CONFLICT DO NOTHING — aluno não duplica na mesma sessão
    const created = await this.prisma.attendanceRecord.createMany({
      data: [
        {
          tenantId,
          classSessionId: session.id,
          userId,
          status: "present",
          recognizedAt,
          confidence: scores.confidence,
          livenessScore: scores.livenessScore,
          wasPreAttendance: false,
        },
      ],
      skipDuplicates: true,
    });

    if (created.count > 0) {
      sseService.broadcast(sseService.sessionChannel(tenantId, session.id), "attendance", {
        sessionId: session.id,
        userId,
        name: personName,
        status: "present",
        recognizedAt: recognizedAt.toISOString(),
        confidence: scores.confidence,
      });
    }

    sseService.broadcast(sseService.deviceChannel(tenantId, deviceId), "recognition", {
      status: "identified",
      personName,
      confidence: scores.confidence,
    });
  }

  /**
   * Registra a saída antecipada quando o professor já liberou este aluno.
   *
   * Retorna null quando não há saída a registrar (sem liberação, ou já
   * registrada) — o chamador segue o fluxo normal de entrada.
   *
   * As aulas cumpridas são contadas a partir da hora REAL de início da aula
   * informada pelo professor, não de quando a chamada foi aberta no sistema.
   */
  private async tryRegisterCheckout(
    tenantId: string,
    deviceId: string,
    session: ActiveSession,
    userId: string,
    personName: string
  ): Promise<{ checkout: true; classesCounted: number } | null> {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: {
        tenantId,
        classSessionId: session.id,
        userId,
        checkoutReleasedById: { not: null },
        checkedOutAt: null,
      },
      select: { id: true },
    });
    if (!record) return null;

    const checkedOutAt = new Date();
    const classesCounted = lessonsCompletedOnCheckout(
      session.startedAt,
      checkedOutAt,
      session.lessonDurationMin,
      session.classesWorth
    );

    // Condição no WHERE mantém a operação idempotente: dois frames seguidos
    // do mesmo aluno não gravam duas saídas
    const updated = await this.prisma.attendanceRecord.updateMany({
      where: { id: record.id, checkedOutAt: null },
      data: { status: "early_checkout", checkedOutAt, classesCounted },
    });
    if (updated.count === 0) return null;

    sseService.broadcast(sseService.sessionChannel(tenantId, session.id), "checkout", {
      sessionId: session.id,
      userId,
      name: personName,
      checkedOutAt: checkedOutAt.toISOString(),
      classesCounted,
    });
    sseService.broadcast(sseService.deviceChannel(tenantId, deviceId), "recognition", {
      status: "identified",
      personName,
      checkout: true,
      classesCounted,
    });

    this.logger.info(
      { tenantId, sessionId: session.id, userId, classesCounted },
      "Early checkout registered"
    );
    return { checkout: true, classesCounted };
  }

  /**
   * Pré-presença com SET NX no Redis para evitar gravação duplicada no
   * mesmo dia/localização antes de consultar o banco.
   */
  private async registerPreAttendance(
    tenantId: string,
    locationId: string,
    userId: string,
    scores: { confidence: number; livenessScore: number },
    windowMin: number
  ): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const nxKey = `preatt:${tenantId}:${locationId}:${userId}:${day}`;

    const acquired = await redis.set(nxKey, "1", { NX: true, EX: windowMin * 60 });
    if (acquired === null) return false; // já registrada na janela

    const now = new Date();
    await this.prisma.preAttendance.create({
      data: {
        tenantId,
        locationId,
        userId,
        recognizedAt: now,
        confidence: scores.confidence,
        livenessScore: scores.livenessScore,
        expires_at: new Date(now.getTime() + windowMin * 60 * 1000),
        consolidated: false,
      },
    });

    this.logger.info({ tenantId, locationId, userId }, "Pre-attendance registered");
    return true;
  }

  /**
   * Salva o frame da tentativa de fraude e marca o log correspondente.
   * Fire-and-forget: falhas são logadas, nunca propagadas ao hot path.
   */
  private async saveFraudFrame(
    tenantId: string,
    logId: string,
    imageJpeg: Buffer
  ): Promise<void> {
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const dir = path.join(config.fraudFramesStoragePath, tenantId, dateStr);
      await fs.mkdir(dir, { recursive: true });

      const filePath = path.join(dir, `${now.getTime()}_failed_${logId}.jpg`);
      await fs.writeFile(filePath, imageJpeg);

      await this.prisma.recognitionLog.updateMany({
        where: { id: logId, tenantId },
        data: { fraudFramePath: filePath, fraudFrameExists: true },
      });
    } catch (error) {
      this.logger.warn({ tenantId, logId, error }, "Failed to save fraud frame");
    }
  }

  private mapEngineStatus(engineStatus: string): string {
    // A engine responde 'face_not_recognized'; o banco registra 'not_identified'
    if (engineStatus === "face_not_recognized") return "not_identified";
    return engineStatus;
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

export const recognitionService = new RecognitionService();
