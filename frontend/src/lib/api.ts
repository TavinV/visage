/**
 * API client — fetch com sessão via cookie httpOnly.
 *
 * access_token e refresh_token vivem em cookies httpOnly/Secure/SameSite=Strict
 * setados pelo backend (ver backend/src/routes/auth.ts) — nunca em
 * localStorage/sessionStorage nem visíveis ao JS. O browser os anexa
 * automaticamente em toda chamada same-origin a /api/*. Num 401 o client
 * tenta UMA vez POST /auth/refresh e repete a request original. Se o refresh
 * falhar, dispara logout global (o AuthProvider redireciona).
 */

// Sempre relativo: o Next.js faz o proxy server-side para o backend real
// (ver rewrites em next.config.mjs). O browser nunca chama o backend direto,
// então o domínio dele não aparece no menu Network.
export const API_URL = "/api";

const USER_KEY = "visage.user";

export interface ApiValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: ApiValidationIssue[];

  constructor(status: number, code: string, message: string, issues?: ApiValidationIssue[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

// ── Token store (módulo, compartilhado com o AuthProvider) ───────────────────
// Só guarda o perfil do usuário (não-sensível, só para renderizar a UI antes
// do primeiro round-trip) — a credencial em si é o cookie httpOnly, invisível
// aqui de propósito.

let onSessionExpired: (() => void) | null = null;

export const tokenStore = {
  getStoredUser: <T,>(): T | null => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setStoredUser: (user: unknown | null) => {
    if (typeof window === "undefined") return;
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  },
  setSessionExpiredHandler: (handler: (() => void) | null) => {
    onSessionExpired = handler;
  },
};

// ── Refresh (deduplicado — várias requests 401 compartilham a mesma promise) ──

let refreshPromise: Promise<boolean> | null = null;

/**
 * Pede ao backend para rotacionar o refresh token (lido do cookie httpOnly)
 * por um novo par — o Set-Cookie da resposta atualiza os cookies sozinho,
 * não há token para o client guardar. Deduplicado no nível do módulo:
 * chamadas concorrentes (StrictMode, várias requests 401) compartilham a
 * mesma promise — essencial porque o backend rotaciona o refresh token a
 * cada uso.
 */
export async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "same-origin",
        });
        return res.ok;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── Fetch principal ───────────────────────────────────────────────────────────

async function parseError(res: Response): Promise<ApiError> {
  let code = "unknown_error";
  let message = `Erro ${res.status}`;
  let issues: ApiValidationIssue[] | undefined;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    if (body?.code) code = body.code;
    if (Array.isArray(body?.issues)) issues = body.issues;
  } catch {
    // resposta sem corpo JSON (ex.: 429 do rate limiter)
  }
  return new ApiError(res.status, code, message, issues);
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...init, credentials: "same-origin" });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await rawFetch(path, init);
    } else {
      onSessionExpired?.();
      throw new ApiError(401, "session_expired", "Sessão expirada. Entre novamente.");
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path),
  post: <T,>(path: string, body?: unknown) => apiFetch<T>(path, jsonInit("POST", body)),
  put: <T,>(path: string, body?: unknown) => apiFetch<T>(path, jsonInit("PUT", body)),
  patch: <T,>(path: string, body?: unknown) => apiFetch<T>(path, jsonInit("PATCH", body)),
  delete: <T,>(path: string) => apiFetch<T>(path, jsonInit("DELETE")),
};

/**
 * Busca um recurso binário autenticado (ex.: fraud frame JPEG) e devolve um
 * object URL. Um <img src> direto mandaria o cookie automaticamente, mas o
 * caller ainda precisa de um blob URL para <img>/download — mantido por
 * consistência com o resto do client.
 */
export async function fetchAuthenticatedBlobUrl(path: string): Promise<string> {
  let res = await rawFetch(path, {});
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      onSessionExpired?.();
      throw new ApiError(401, "session_expired", "Sessão expirada. Entre novamente.");
    }
    res = await rawFetch(path, {});
  }
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Monta uma query string ignorando valores vazios/undefined. */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}
