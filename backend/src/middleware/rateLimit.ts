/**
 * Rate Limiting Middleware
 *
 * Limites por camada:
 *   - Global API   : 3000 req / 15 min por IP
 *   - Auth (login) : 20   req / 15 min por IP  (anti brute-force)
 *   - Auth (geral) : 120  req / 15 min por IP
 *
 * O bucket global é por IP: atrás de um NAT escolar, console + vários totens
 * da instituição compartilham o MESMO IP — e um único totem em descanso já
 * consome ~10 req/min de polling (contexto, sessão, calibração). Por isso o
 * teto precisa ser alto; proteção fina fica nos limiters específicos
 * (login, recognize por device).
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
    limit: 3000,
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
    limit: 20,
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
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("auth"),
    handler,
  });
}

/** Factory — limiter para POST /demo-requests (anti-spam do form público) */
export function createDemoRequestLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("demo-request"),
    handler,
  });
}

/**
 * Limiters de dispositivo — chaveados por deviceId (não por IP).
 * Devem ser aplicados APÓS deviceAuth, que popula req.device.
 */

/** Factory — limiter para POST /device/recognize (100 req/min por device) */
export function createDeviceRecognizeLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("device-recognize"),
    keyGenerator: (req: Request) => req.device?.deviceId ?? "unauthenticated-device",
    handler,
  });
}

/** Factory — limiter para GET /device/heartbeat (10 req/min por device) */
export function createDeviceHeartbeatLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: makeStore("device-heartbeat"),
    keyGenerator: (req: Request) => req.device?.deviceId ?? "unauthenticated-device",
    handler,
  });
}
