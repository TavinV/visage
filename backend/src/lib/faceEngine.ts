/**
 * Face Engine HTTP Client
 * Único ponto de comunicação Node → engine Python (FastAPI, porta 8001).
 *
 * A engine nunca acessa o banco: recebe DEK cifrada + embeddings cifrados
 * por request e retorna resultados. Autenticação via header X-API-Key.
 */

import { config } from "./config";
import { logger } from "./logger";

// ── Tipos de payload ─────────────────────────────────────────────────────────

/** DEK do tenant cifrada com MASTER_KEY — campos em hex. */
export interface EncryptedDekPayload {
  dekCt: string;
  dekIv: string;
  dekTag: string;
  keyVersion: number;
}

/** Embedding cifrado de um candidato — campos em hex. */
export interface EncryptedCandidate {
  person_id: string;
  embedding_iv: string;
  embedding_tag: string;
  embedding_ct: string;
  key_version: number;
}

export interface RecognizeThresholds {
  recognitionThreshold?: number;
  livenessThreshold?: number;
  detectionScoreMin?: number;
}

export interface EngineRecognizeResult {
  status: string; // identified | face_not_recognized | liveness_failed | no_face_detected | multiple_faces_detected
  person_id?: string | number | null;
  confidence?: number | null;
  liveness_combined_raw?: number | null;
  liveness_v1_raw?: number | null;
  liveness_v2_raw?: number | null;
  saturation_mean?: number | null;
  saturation_std?: number | null;
  detection_score_raw?: number | null;
  best_distance_raw?: number | null;
  processing_ms: number;
}

export interface EngineEnrollFrameResult {
  status: string; // frame_accepted | no_face_detected | multiple_faces_detected | low_detection_score | liveness_failed
  embedding_iv?: string | null;
  embedding_tag?: string | null;
  embedding_ct?: string | null;
  liveness_score?: number | null;
  detection_score?: number | null;
  processing_ms: number;
}

export interface EngineEnrollFinalizeResult {
  embedding_iv: string;
  embedding_tag: string;
  embedding_ct: string;
  key_version: number;
  model_version: string;
  frames_used: number;
}

export interface EngineHealthResult {
  status: string;
  models: Record<string, boolean>;
}

export interface EngineDetectResult {
  face_count: number;
  faces: Array<{ det_score: number; area_ratio: number }>;
  processing_ms: number;
}

export class FaceEngineError extends Error {
  status: number;
  code = "face_engine_error";

  constructor(message: string, status: number = 502) {
    super(message);
    this.name = "FaceEngineError";
    this.status = status;
  }
}

// ── Núcleo HTTP ──────────────────────────────────────────────────────────────

async function engineFetch(
  path: string,
  init: RequestInit,
  timeoutMs: number = config.faceEngineTimeout
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.faceEngineUrl}${path}`, {
      ...init,
      headers: {
        "X-API-Key": config.engineApiKey,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : `HTTP ${response.status}`;
      logger.warn({ path, status: response.status, detail }, "Face engine returned error");
      throw new FaceEngineError(detail, response.status);
    }

    return body;
  } catch (error) {
    if (error instanceof FaceEngineError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      logger.error({ path, timeoutMs }, "Face engine request timed out");
      throw new FaceEngineError("Face engine timeout", 504);
    }
    logger.error({ path, error }, "Face engine unreachable");
    throw new FaceEngineError("Face engine unreachable", 502);
  } finally {
    clearTimeout(timer);
  }
}

function appendDekFields(form: FormData, dek: EncryptedDekPayload): void {
  form.append("dek_ct", dek.dekCt);
  form.append("dek_iv", dek.dekIv);
  form.append("dek_tag", dek.dekTag);
  form.append("dek_key_version", String(dek.keyVersion));
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * POST /recognize — hot path do reconhecimento.
 */
export async function engineRecognize(params: {
  tenantId: string;
  imageJpeg: Buffer;
  dek: EncryptedDekPayload;
  candidates: EncryptedCandidate[];
  thresholds?: RecognizeThresholds;
}): Promise<EngineRecognizeResult> {
  const form = new FormData();
  form.append("tenant_id", params.tenantId);
  form.append("image", new Blob([new Uint8Array(params.imageJpeg)], { type: "image/jpeg" }), "frame.jpg");
  form.append("candidates", JSON.stringify(params.candidates));
  appendDekFields(form, params.dek);

  const t = params.thresholds;
  if (t?.recognitionThreshold !== undefined) form.append("recognition_threshold", String(t.recognitionThreshold));
  if (t?.livenessThreshold !== undefined) form.append("liveness_threshold", String(t.livenessThreshold));
  if (t?.detectionScoreMin !== undefined) form.append("detection_score_min", String(t.detectionScoreMin));

  return (await engineFetch("/recognize", { method: "POST", body: form })) as EngineRecognizeResult;
}

/**
 * POST /enroll/frame — pipeline rigoroso do cadastro (det ≥ 0.85, liveness ≥ 0.90).
 */
export async function engineEnrollFrame(params: {
  tenantId: string;
  imageJpeg: Buffer;
  dek: EncryptedDekPayload;
  livenessThresholdEnrollment?: number;
}): Promise<EngineEnrollFrameResult> {
  const form = new FormData();
  form.append("tenant_id", params.tenantId);
  form.append("image", new Blob([new Uint8Array(params.imageJpeg)], { type: "image/jpeg" }), "frame.jpg");
  appendDekFields(form, params.dek);
  if (params.livenessThresholdEnrollment !== undefined) {
    form.append("liveness_threshold", String(params.livenessThresholdEnrollment));
  }

  return (await engineFetch("/enroll/frame", { method: "POST", body: form })) as EngineEnrollFrameResult;
}

/**
 * POST /enroll/finalize — média vetorial + normalização L2 + re-criptografia.
 */
export async function engineEnrollFinalize(params: {
  tenantId: string;
  dek: EncryptedDekPayload;
  frames: Array<{ embedding_iv: string; embedding_tag: string; embedding_ct: string }>;
}): Promise<EngineEnrollFinalizeResult> {
  const body = {
    tenant_id: params.tenantId,
    tenant_dek: {
      dek_ct: params.dek.dekCt,
      dek_iv: params.dek.dekIv,
      dek_tag: params.dek.dekTag,
      key_version: params.dek.keyVersion,
    },
    frames: params.frames,
  };

  return (await engineFetch("/enroll/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as EngineEnrollFinalizeResult;
}

/**
 * POST /detect — detecção pura de faces (sem biometria, sem DEK).
 * Usada para validar amostras antes de armazená-las (ex.: calibração).
 */
export async function engineDetectFaces(params: {
  imageJpeg: Buffer;
  minDetScore?: number;
}): Promise<EngineDetectResult> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(params.imageJpeg)], { type: "image/jpeg" }), "sample.jpg");
  if (params.minDetScore !== undefined) form.append("min_det_score", String(params.minDetScore));
  return (await engineFetch("/detect", { method: "POST", body: form })) as EngineDetectResult;
}

/**
 * POST /cache/warm — aquece o cache da engine com os candidatos da turma.
 */
export async function engineWarmCache(params: {
  tenantId: string;
  dek: EncryptedDekPayload;
  candidates: EncryptedCandidate[];
}): Promise<{ warmed: number }> {
  const body = {
    tenant_id: params.tenantId,
    tenant_dek: {
      dek_ct: params.dek.dekCt,
      dek_iv: params.dek.dekIv,
      dek_tag: params.dek.dekTag,
      key_version: params.dek.keyVersion,
    },
    candidates: params.candidates,
  };

  return (await engineFetch("/cache/warm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as { warmed: number };
}

/**
 * DELETE /cache/dek/{tenant_id} — invalida DEK em cache (rotação de chave).
 */
export async function engineInvalidateDek(tenantId: string): Promise<void> {
  await engineFetch(`/cache/dek/${encodeURIComponent(tenantId)}`, { method: "DELETE" });
}

/**
 * DELETE /embeddings/{tenant_id}/{person_id} — invalida embedding em cache.
 */
export async function engineInvalidateEmbedding(
  tenantId: string,
  personId: string
): Promise<void> {
  await engineFetch(
    `/embeddings/${encodeURIComponent(tenantId)}/${encodeURIComponent(personId)}`,
    { method: "DELETE" }
  );
}

/**
 * GET /health — saúde da engine (proxy para super_admin).
 */
export async function engineHealth(): Promise<EngineHealthResult> {
  return (await engineFetch("/health", { method: "GET" }, 5000)) as EngineHealthResult;
}

// ── Calibração (índice de Youden) ─────────────────────────────────────────────

export interface EngineThresholdAnalysis {
  metric: string;
  suggested_value: number;
  real_pass_rate: number;
  attack_block_rate: number;
  youden_score: number;
  confidence: "low" | "medium" | "high";
  interpretation: string;
}

export interface EngineLivenessCalibration {
  liveness_analysis: EngineThresholdAnalysis;
  hsv_analysis: EngineThresholdAnalysis;
  suggested_thresholds: Record<string, number>;
  total_samples: number;
  real_samples_processed: number;
  attack_samples_processed: number;
  real_samples_failed: number;
  attack_samples_failed: number;
  overall_interpretation: string;
  warning?: string | null;
}

export interface EngineRecognitionOption {
  profile: "conservative" | "balanced" | "liberal";
  profile_label: string;
  threshold: number;
  genuine_accept_rate: number;
  impostor_reject_rate: number;
  false_rejection_rate: number;
  false_acceptance_rate: number;
  youden_score: number;
  interpretation: string;
}

export interface EngineRecognitionCalibration {
  persons_processed: Array<{ person_id: string; photo_count: number; failed_photos: number }>;
  impostor_count: number;
  impostor_failed: number;
  dprime: number;
  eer: number;
  auc: number;
  options: EngineRecognitionOption[];
  recommended_profile: string;
  recommended_threshold: number;
  total_genuine_pairs: number;
  total_impostor_pairs: number;
  confidence: "low" | "medium" | "high";
  warning?: string | null;
  overall_interpretation: string;
}

function appendJpegs(form: FormData, field: string, files: Array<{ name: string; jpeg: Buffer }>) {
  for (const file of files) {
    form.append(
      field,
      new Blob([new Uint8Array(file.jpeg)], { type: "image/jpeg" }),
      file.name
    );
  }
}

/**
 * POST /calibrate/liveness — Youden sobre amostras reais × ataques
 * (fotos de tela/impressas). Calibra liveness e saturação HSV.
 */
export async function engineCalibrateLiveness(params: {
  real: Array<{ name: string; jpeg: Buffer }>;
  attacks: Array<{ name: string; jpeg: Buffer }>;
}): Promise<EngineLivenessCalibration> {
  const form = new FormData();
  appendJpegs(form, "real_images", params.real);
  appendJpegs(form, "attack_images", params.attacks);
  // Calibração pode processar até 40 imagens — timeout generoso
  return (await engineFetch("/calibrate/liveness", { method: "POST", body: form }, 120_000)) as EngineLivenessCalibration;
}

/**
 * POST /calibrate/recognition — Youden genuínos × impostores.
 * O agrupamento por pessoa usa o prefixo antes do último "_" no filename
 * (pessoa1_1.jpg, pessoa1_2.jpg → mesma pessoa).
 */
export async function engineCalibrateRecognition(params: {
  legitimate: Array<{ name: string; jpeg: Buffer }>;
  impostors: Array<{ name: string; jpeg: Buffer }>;
}): Promise<EngineRecognitionCalibration> {
  const form = new FormData();
  appendJpegs(form, "legitimate_images", params.legitimate);
  appendJpegs(form, "impostor_images", params.impostors);
  return (await engineFetch("/calibrate/recognition", { method: "POST", body: form }, 120_000)) as EngineRecognitionCalibration;
}
