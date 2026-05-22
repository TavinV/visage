/**
 * Rate Limiting Middleware
 *
 * Limites por camada:
 *   - Global API   : 300 req / 15 min por IP
 *   - Auth (login) : 10  req / 15 min por IP  (anti brute-force)
 *   - Auth (geral) : 30  req / 15 min por IP
 *
 * Os limiters são criados via factory para garantir que o Redis
 * já esteja conectado no momento da inicialização do RedisStore.
 */

import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis";
import { Request, Response } from "express";

function handler(_req: Request, res: Response) {
  res.status(429).json({
    error: "Too many requests — tente novamente mais tarde",
    code: "rate_limit_exceeded",
  });
}

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
}

/** Factory — limiter global aplicado em todas as rotas */
export function createGlobalLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("global"),
    handler,
  });
}

/** Factory — limiter para POST /auth/login (anti brute-force) */
export function createLoginLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("login"),
    handler,
  });
}

/** Factory — limiter para demais rotas de auth (/refresh, /logout) */
export function createAuthLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("auth"),
    handler,
  });
}
