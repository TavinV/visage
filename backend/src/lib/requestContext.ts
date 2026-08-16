/**
 * Contexto de requisição — quem está falando, de onde e por qual rota.
 *
 * A trilha de auditoria precisa de IP, user agent e identidade do ator em
 * lugares fundos da árvore de chamadas (services, jobs). Passar isso como
 * parâmetro contaminaria a assinatura de praticamente todo método de service,
 * então o contexto viaja por AsyncLocalStorage: o middleware abre o escopo no
 * início da requisição e tudo que roda dentro dela enxerga o mesmo store.
 *
 * RULE: nada aqui pode lançar. Auditoria é observabilidade — se o contexto
 * sumir, a ação do usuário continua valendo e o log sai com o que houver.
 */

import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ActorType = "user" | "device" | "system" | "anonymous";

export interface RequestContext {
  /** IP de origem já normalizado (sem prefixo ::ffff: de IPv4 mapeado). */
  ip?: string;
  userAgent?: string;
  method?: string;
  /** Rota da requisição, truncada em 200 chars (limite da coluna). */
  path?: string;

  actorType: ActorType;
  tenantId?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  /** auth_sessions.id — vem do claim `sid` do JWT. */
  sessionId?: string;
  /** devices.id quando quem age é um totem. */
  deviceId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

// ── Leitura / escrita ────────────────────────────────────────────────────────

/** Contexto da requisição atual, ou undefined fora de uma (jobs, bootstrap). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Enriquece o contexto vigente. Usado pelos middlewares de autenticação, que
 * só descobrem o ator depois que o escopo já foi aberto.
 * No-op fora de uma requisição.
 */
export function setActor(patch: Partial<RequestContext>): void {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, patch);
}

/**
 * Roda `fn` sob um contexto explícito. Usado por jobs e pelo bootstrap, que
 * não têm requisição HTTP mas ainda produzem eventos auditáveis.
 */
export function runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  return storage.run({ actorType: "system", ...context }, fn);
}

// ── Extração a partir do Express ─────────────────────────────────────────────

/**
 * IP real do cliente. Atrás de proxy reverso o Express só entrega o IP correto
 * com `trust proxy` ligado — daí o fallback manual para X-Forwarded-For.
 */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  const raw =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ||
    req.ip ||
    req.socket?.remoteAddress;

  if (!raw) return undefined;
  // IPv4 mapeado em IPv6 (::ffff:187.1.2.3) → 187.1.2.3
  const normalized = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return normalized.slice(0, 45);
}

function truncate(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, max);
}

/**
 * Middleware global — abre o escopo do contexto para toda a requisição.
 * Deve ser registrado ANTES das rotas e de qualquer middleware de auth.
 */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  storage.run(
    {
      actorType: "anonymous",
      ip: clientIp(req),
      userAgent: truncate(req.headers["user-agent"], 500),
      method: req.method,
      path: truncate(req.originalUrl?.split("?")[0] ?? req.path, 200),
    },
    () => next(),
  );
}
