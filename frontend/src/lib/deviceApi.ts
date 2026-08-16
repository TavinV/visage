/**
 * API do totem — autenticada via header X-Device-Key (não usa JWT).
 * A chave é gerada uma única vez em POST /devices e fica no localStorage
 * do dispositivo que atua como totem.
 */

import { API_URL } from "./api";

const DEVICE_KEY = "visage.deviceKey";

export const deviceKeyStore = {
  get: (): string | null =>
    typeof window === "undefined" ? null : window.localStorage.getItem(DEVICE_KEY),
  set: (key: string) => window.localStorage.setItem(DEVICE_KEY, key),
  clear: () => window.localStorage.removeItem(DEVICE_KEY),
};

export class DeviceApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function deviceFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = deviceKeyStore.get();
  if (!key) throw new DeviceApiError(401, "missing_key", "Chave do dispositivo não configurada.");

  const headers = new Headers(init.headers);
  headers.set("X-Device-Key", key);
  if (init.body) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let code = "unknown_error";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
    } catch {
      // sem corpo JSON (ex.: rate limit)
    }
    throw new DeviceApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export type RecognizeStatus =
  | "identified"
  | "not_identified"
  | "liveness_failed"
  | "no_face_detected"
  | "multiple_faces_detected"
  | "no_active_session"
  | string;

export interface RecognizeResult {
  status: RecognizeStatus;
  personName?: string;
  confidence?: number;
  preAttendance?: boolean;
  /** Este reconhecimento registrou a SAÍDA do aluno, não a entrada. */
  checkout?: boolean;
  /** Aulas cumpridas até a saída. */
  classesCounted?: number;
}

export interface CurrentSession {
  id: string;
  classId: string;
  className: string;
  startedAt: string;
  classesWorth: number;
  /** Fim previsto da chamada — fecha sozinha nesse instante. */
  scheduledEndsAt?: string;
}

/** O que o aluno digita no totem — definido em Configurações. */
export type TotemIdentification = "cpf" | "enrollment_code" | "any";

export interface DeviceContext {
  tenantName: string;
  deviceLabel: string | null;
  clockTimezone: string;
  /** Template da senha do painel oculto ({{data}}/{{hora}}) ou null. */
  panelPassword: string | null;
  /** Cadastro biométrico liberado para este totem no painel. */
  allowEnrollment: boolean;
  /** Identificador pedido na primeira tela do cadastro. */
  totemIdentification: TotemIdentification;
}

export interface EnrollmentLookup {
  name: string;
  /** Ausente quando a instituição não registra CPF. */
  document?: string;
  enrollmentCode?: string;
  facialStatus: string;
}

export interface EnrollmentSessionInfo {
  sessionId: string;
  student: { id: string; name: string };
  requiresConsent: boolean;
  requiredFrames: number;
  consentTextVersion: string;
  expiresInSeconds: number;
}

export interface EnrollmentFrameResult {
  accepted: boolean;
  reason?: string;
  livenessScore?: number;
  framesCollected: number;
  requiredFrames: number;
  completed: boolean;
}

export type CalibrationPhase = "genuine" | "impostor" | "attack" | "done";

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
  canComputeRecognition: boolean;
  canComputeLiveness: boolean;
  hasResults: boolean;
}

export const deviceApi = {
  recognize: (imageB64: string) =>
    deviceFetch<{ data: RecognizeResult }>("/device/recognize", {
      method: "POST",
      body: JSON.stringify({ imageB64 }),
    }).then((r) => r.data),

  currentSession: () =>
    deviceFetch<{ data: CurrentSession | null }>("/device/session/current").then((r) => r.data),

  context: () => deviceFetch<{ data: DeviceContext }>("/device/context").then((r) => r.data),

  /** Também serve como "testar conexão" ao salvar a chave. */
  heartbeat: () => deviceFetch<{ data: { ok: boolean } }>("/device/heartbeat").then((r) => r.data),

  // ── Cadastro biométrico por CPF ou matrícula ───────────────────────────────

  enrollmentLookup: (identifier: string) =>
    deviceFetch<{ data: EnrollmentLookup }>("/enrollment/lookup", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }).then((r) => r.data),

  enrollmentStart: (identifier: string) =>
    deviceFetch<{ data: EnrollmentSessionInfo }>("/enrollment/start", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }).then((r) => r.data),

  enrollmentConsent: (sessionId: string) =>
    deviceFetch<{ data: { step: string } }>("/enrollment/consent", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).then((r) => r.data),

  enrollmentRefuse: (sessionId: string) =>
    deviceFetch<{ data: { refused: boolean } }>("/enrollment/refuse", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).then((r) => r.data),

  enrollmentFrame: (sessionId: string, imageB64: string) =>
    deviceFetch<{ data: EnrollmentFrameResult }>("/enrollment/frame", {
      method: "POST",
      body: JSON.stringify({ sessionId, imageB64 }),
    }).then((r) => r.data),

  enrollmentFinalize: (sessionId: string) =>
    deviceFetch<{ data: { userId: string; framesUsed: number } }>("/enrollment/finalize", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).then((r) => r.data),

  // ── Calibração guiada (Youden na engine) ───────────────────────────────────

  calibrationProgress: () =>
    deviceFetch<{ data: CalibrationProgress }>("/device/calibration").then((r) => r.data),

  calibrationSample: (imageB64: string) =>
    deviceFetch<{ data: CalibrationProgress }>("/device/calibration/sample", {
      method: "POST",
      body: JSON.stringify({ imageB64 }),
    }).then((r) => r.data),

  calibrationAdvance: (action: "next-person" | "next-phase") =>
    deviceFetch<{ data: CalibrationProgress }>("/device/calibration/advance", {
      method: "POST",
      body: JSON.stringify({ action }),
    }).then((r) => r.data),
};

/**
 * Expande o template da senha do painel: {{data}} → DDMM, {{hora}} → HHMM.
 * Aceita a senha do minuto atual e do anterior (quem digita na virada do
 * minuto não é punido).
 */
export function panelPasswordCandidates(template: string, now = new Date()): string[] {
  const expand = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return template
      .replaceAll("{{data}}", `${dd}${mm}`)
      .replaceAll("{{hora}}", `${hh}${min}`);
  };
  const previousMinute = new Date(now.getTime() - 60_000);
  return [expand(now), expand(previousMinute)];
}
