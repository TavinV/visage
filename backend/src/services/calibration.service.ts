/**
 * CalibrationService — calibração guiada de reconhecimento e vivacidade
 *
 * O admin inicia no painel; o totem coleta imagens em três fases:
 *   1. genuine  — pessoas legítimas (≥2 pessoas × 3 fotos; máx. 6 pessoas)
 *   2. impostor — pessoas de fora do sistema (3–12 fotos avulsas)
 *   3. attack   — ataques de apresentação: foto impressa/tela (3–10 fotos)
 *
 * Ao final o painel dispara o cálculo: as imagens vão para as rotas de
 * calibração da engine (índice de Youden) e os perfis retornam para o modal.
 * Estado inteiro no Redis (TTL 30min) — nada é persistido no banco.
 */

import { BaseService } from "./base.service";
import { redis } from "../lib/redis";
import { NotFoundError, ValidationError } from "../utils/errors";
import {
  engineCalibrateLiveness,
  engineCalibrateRecognition,
  engineDetectFaces,
  type EngineLivenessCalibration,
  type EngineRecognitionCalibration,
} from "../lib/faceEngine";

const CALIB_TTL_SECONDS = 1800; // 30 minutos — a coleta guiada leva tempo
const PHOTOS_PER_PERSON = 3;
const MAX_PEOPLE = 6; // 6 × 3 = 18 ≤ limite de 20 da engine
const MAX_IMPOSTORS = 12;
const MAX_ATTACKS = 10;
const MIN_PEOPLE = 2;
const MIN_IMPOSTORS = 3;
const MIN_ATTACKS = 1;

const key = (tenantId: string, deviceId: string) => `calib:${tenantId}:${deviceId}`;

export type CalibrationPhase = "genuine" | "impostor" | "attack" | "done";

interface CalibrationState {
  active: boolean;
  startedAt: string;
  phase: CalibrationPhase;
  /** Fotos base64 por pessoa legítima (índice = pessoa). */
  genuine: string[][];
  impostors: string[];
  attacks: string[];
  results?: CalibrationResults;
  computeError?: string;
}

export interface CalibrationResults {
  computedAt: string;
  recognition?: EngineRecognitionCalibration;
  recognitionError?: string;
  liveness?: EngineLivenessCalibration;
  livenessError?: string;
}

export interface CalibrationProgress {
  active: boolean;
  startedAt: string;
  phase: CalibrationPhase;
  people: number;
  photosCurrentPerson: number;
  photosPerPerson: number;
  genuineTotal: number;
  impostors: number;
  attacks: number;
  limits: {
    maxPeople: number;
    maxImpostors: number;
    maxAttacks: number;
    minPeople: number;
    minImpostors: number;
    minAttacks: number;
  };
  /** Requisitos mínimos atendidos para calcular cada análise. */
  canComputeRecognition: boolean;
  canComputeLiveness: boolean;
  hasResults: boolean;
}

function decodeJpeg(imageB64: string): Buffer {
  const stripped = imageB64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(stripped, "base64");
  if (buffer.length === 0 || buffer.length > 1024 * 1024) {
    throw new ValidationError("Imagem inválida ou acima de 1MB", "INVALID_IMAGE");
  }
  return buffer;
}

class CalibrationService extends BaseService {
  private async load(tenantId: string, deviceId: string): Promise<CalibrationState | null> {
    const raw = await redis.get(key(tenantId, deviceId));
    return raw ? (JSON.parse(raw) as CalibrationState) : null;
  }

  private async save(tenantId: string, deviceId: string, state: CalibrationState): Promise<void> {
    await redis.set(key(tenantId, deviceId), JSON.stringify(state), { KEEPTTL: true });
  }

  private progressOf(state: CalibrationState | null): CalibrationProgress {
    const genuine = state?.genuine ?? [];
    const genuineTotal = genuine.reduce((sum, photos) => sum + photos.length, 0);
    const completePeople = genuine.filter((p) => p.length >= PHOTOS_PER_PERSON).length;
    return {
      active: state?.active ?? false,
      startedAt: state?.startedAt ?? "",
      phase: state?.phase ?? "genuine",
      people: genuine.length,
      photosCurrentPerson: genuine.length ? genuine[genuine.length - 1].length : 0,
      photosPerPerson: PHOTOS_PER_PERSON,
      genuineTotal,
      impostors: state?.impostors.length ?? 0,
      attacks: state?.attacks.length ?? 0,
      limits: {
        maxPeople: MAX_PEOPLE,
        maxImpostors: MAX_IMPOSTORS,
        maxAttacks: MAX_ATTACKS,
        minPeople: MIN_PEOPLE,
        minImpostors: MIN_IMPOSTORS,
        minAttacks: MIN_ATTACKS,
      },
      canComputeRecognition:
        completePeople >= MIN_PEOPLE && (state?.impostors.length ?? 0) >= MIN_IMPOSTORS,
      canComputeLiveness: genuineTotal >= 1 && (state?.attacks.length ?? 0) >= MIN_ATTACKS,
      hasResults: !!state?.results,
    };
  }

  // ── Painel (JWT admin) ───────────────────────────────────────────────────────

  async start(tenantId: string, deviceId: string): Promise<CalibrationProgress> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true, isActive: true },
    });
    if (!device) throw new NotFoundError("Device not found in this tenant");
    if (!device.isActive) {
      throw new ValidationError("Dispositivo inativo não pode ser calibrado", "DEVICE_INACTIVE");
    }

    const state: CalibrationState = {
      active: true,
      startedAt: new Date().toISOString(),
      phase: "genuine",
      genuine: [[]],
      impostors: [],
      attacks: [],
    };
    await redis.set(key(tenantId, deviceId), JSON.stringify(state), { EX: CALIB_TTL_SECONDS });
    this.logger.info({ tenantId, deviceId }, "Calibration started");
    return this.progressOf(state);
  }

  async stop(tenantId: string, deviceId: string): Promise<void> {
    await redis.del(key(tenantId, deviceId));
    this.logger.info({ tenantId, deviceId }, "Calibration stopped");
  }

  async report(
    tenantId: string,
    deviceId: string
  ): Promise<CalibrationProgress & { results: CalibrationResults | null; computeError?: string }> {
    const state = await this.load(tenantId, deviceId);
    return {
      ...this.progressOf(state),
      results: state?.results ?? null,
      computeError: state?.computeError,
    };
  }

  /**
   * Envia as imagens coletadas para as rotas de calibração da engine.
   * Cada análise falha de forma independente — uma não bloqueia a outra.
   */
  async compute(tenantId: string, deviceId: string): Promise<CalibrationResults> {
    const state = await this.load(tenantId, deviceId);
    if (!state) {
      throw new ValidationError("Calibração não está ativa para este totem", "CALIBRATION_INACTIVE");
    }
    const progress = this.progressOf(state);
    if (!progress.canComputeRecognition && !progress.canComputeLiveness) {
      throw new ValidationError(
        "Amostras insuficientes: colete pelo menos 2 pessoas completas e 3 impostores (reconhecimento) ou 1 ataque (vivacidade)",
        "CALIBRATION_INSUFFICIENT_SAMPLES"
      );
    }

    const results: CalibrationResults = { computedAt: new Date().toISOString() };

    if (progress.canComputeRecognition) {
      try {
        // pessoaN_i.jpg — o prefixo antes do último "_" agrupa por pessoa
        const legitimate = state.genuine.flatMap((photos, personIdx) =>
          photos
            .slice(0, PHOTOS_PER_PERSON)
            .map((b64, i) => ({ name: `pessoa${personIdx + 1}_${i + 1}.jpg`, jpeg: decodeJpeg(b64) }))
        );
        const impostors = state.impostors.map((b64, i) => ({
          name: `impostor_${i + 1}.jpg`,
          jpeg: decodeJpeg(b64),
        }));
        results.recognition = await engineCalibrateRecognition({ legitimate, impostors });
      } catch (error) {
        results.recognitionError =
          error instanceof Error ? error.message : "Falha ao calibrar reconhecimento";
        this.logger.warn({ tenantId, deviceId, error }, "Recognition calibration failed");
      }
    }

    if (progress.canComputeLiveness) {
      try {
        const real = state.genuine
          .flat()
          .slice(0, 20)
          .map((b64, i) => ({ name: `real_${i + 1}.jpg`, jpeg: decodeJpeg(b64) }));
        const attacks = state.attacks
          .slice(0, 20)
          .map((b64, i) => ({ name: `ataque_${i + 1}.jpg`, jpeg: decodeJpeg(b64) }));
        results.liveness = await engineCalibrateLiveness({ real, attacks });
      } catch (error) {
        results.livenessError =
          error instanceof Error ? error.message : "Falha ao calibrar vivacidade";
        this.logger.warn({ tenantId, deviceId, error }, "Liveness calibration failed");
      }
    }

    state.results = results;
    state.computeError = undefined;
    await this.save(tenantId, deviceId, state);
    return results;
  }

  // ── Totem (X-Device-Key) ─────────────────────────────────────────────────────

  async progressForDevice(tenantId: string, deviceId: string): Promise<CalibrationProgress> {
    return this.progressOf(await this.load(tenantId, deviceId));
  }

  async addSample(
    tenantId: string,
    deviceId: string,
    imageB64: string
  ): Promise<CalibrationProgress> {
    const state = await this.load(tenantId, deviceId);
    if (!state?.active) {
      throw new ValidationError("Calibração não está ativa para este totem", "CALIBRATION_INACTIVE");
    }
    // Valida e normaliza o payload antes de guardar
    const jpeg = decodeJpeg(imageB64);
    const clean = imageB64.replace(/^data:image\/\w+;base64,/, "");

    // Amostra sem rosto contamina o cálculo de Youden — valida na engine
    // antes de armazenar (0.6 relaxado: ataques em tela/foto pontuam menos)
    const detection = await engineDetectFaces({ imageJpeg: jpeg, minDetScore: 0.6 });
    if (detection.face_count === 0) {
      throw new ValidationError(
        "Nenhum rosto na imagem — centralize o rosto na guia e tente de novo",
        "CALIBRATION_NO_FACE"
      );
    }
    if (state.phase !== "attack" && detection.face_count > 1) {
      throw new ValidationError(
        "Mais de um rosto na imagem — uma pessoa por vez",
        "CALIBRATION_MULTIPLE_FACES"
      );
    }

    switch (state.phase) {
      case "genuine": {
        const current = state.genuine[state.genuine.length - 1];
        if (current.length >= PHOTOS_PER_PERSON) {
          throw new ValidationError(
            "Pessoa atual já completa — avance para a próxima",
            "CALIBRATION_PERSON_COMPLETE"
          );
        }
        current.push(clean);
        break;
      }
      case "impostor": {
        if (state.impostors.length >= MAX_IMPOSTORS) {
          throw new ValidationError("Limite de impostores atingido", "CALIBRATION_FULL");
        }
        state.impostors.push(clean);
        break;
      }
      case "attack": {
        if (state.attacks.length >= MAX_ATTACKS) {
          throw new ValidationError("Limite de ataques atingido", "CALIBRATION_FULL");
        }
        state.attacks.push(clean);
        break;
      }
      default:
        throw new ValidationError("Coleta já foi concluída neste totem", "CALIBRATION_DONE");
    }

    await this.save(tenantId, deviceId, state);
    return this.progressOf(state);
  }

  /** Transições de fase controladas pelo operador no totem. */
  async advance(
    tenantId: string,
    deviceId: string,
    action: "next-person" | "next-phase"
  ): Promise<CalibrationProgress> {
    const state = await this.load(tenantId, deviceId);
    if (!state?.active) {
      throw new ValidationError("Calibração não está ativa para este totem", "CALIBRATION_INACTIVE");
    }

    if (action === "next-person") {
      if (state.phase !== "genuine") {
        throw new ValidationError("Fora da fase de pessoas legítimas", "CALIBRATION_WRONG_PHASE");
      }
      if (state.genuine.length >= MAX_PEOPLE) {
        throw new ValidationError("Limite de pessoas atingido", "CALIBRATION_FULL");
      }
      const current = state.genuine[state.genuine.length - 1];
      if (current.length < PHOTOS_PER_PERSON) {
        throw new ValidationError(
          `Complete as ${PHOTOS_PER_PERSON} fotos da pessoa atual antes de avançar`,
          "CALIBRATION_PERSON_INCOMPLETE"
        );
      }
      state.genuine.push([]);
    } else {
      // next-phase
      if (state.phase === "genuine") {
        // Descarta pessoa vazia no fim da fase (ex.: avançou sem novo participante)
        state.genuine = state.genuine.filter((p) => p.length > 0);
        const complete = state.genuine.filter((p) => p.length >= PHOTOS_PER_PERSON).length;
        if (complete < MIN_PEOPLE) {
          throw new ValidationError(
            `São necessárias pelo menos ${MIN_PEOPLE} pessoas com ${PHOTOS_PER_PERSON} fotos`,
            "CALIBRATION_INSUFFICIENT_SAMPLES"
          );
        }
        state.phase = "impostor";
      } else if (state.phase === "impostor") {
        if (state.impostors.length < MIN_IMPOSTORS) {
          throw new ValidationError(
            `São necessários pelo menos ${MIN_IMPOSTORS} impostores`,
            "CALIBRATION_INSUFFICIENT_SAMPLES"
          );
        }
        state.phase = "attack";
      } else if (state.phase === "attack") {
        state.phase = "done";
      }
    }

    await this.save(tenantId, deviceId, state);
    return this.progressOf(state);
  }
}

export const calibrationService = new CalibrationService();
