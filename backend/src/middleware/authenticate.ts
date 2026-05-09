/**
 * Authentication middleware
 * Extrai tenantId e userId do JWT, popula req.tenant
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../lib/config";
import { JWTPayload, TenantContext } from "../types";
import { UnauthorizedError } from "../utils/errors";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";

// Estender Express Request
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      rawToken?: string;
    }
  }
}

/**
 * Extrai token do header Authorization: Bearer <token>
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Middleware de autenticação via JWT
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    req.rawToken = token;

    const payload = jwt.verify(token, config.jwtSecret) as unknown as JWTPayload;

    req.tenant = {
      tenantId: payload.tenantId,
      userId: payload.sub,
      role: payload.role as any,
      email: payload.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ error: error.message }, "Invalid JWT token");
      res.status(401).json({
        error: "Invalid token",
        code: "invalid_token",
      });
      return;
    }

    if (error instanceof UnauthorizedError) {
      res.status(401).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    logger.error({ error }, "Authentication error");
    res.status(500).json({
      error: "Internal server error",
      code: "internal_error",
    });
  }
}

/**
 * Middleware para validar que tenant está ativo
 * Cacheia resultado por 60s em Redis
 */
export function validateTenantActive(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  (async () => {
    try {
      if (!req.tenant) {
        throw new UnauthorizedError("Tenant context not found");
      }

      const cacheKey = `tenant:status:${req.tenant.tenantId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const status = cached;
        if (status !== "active") {
          throw new UnauthorizedError(`Tenant status: ${status}`);
        }
        next();
        return;
      }

      // Validar no banco
      const { prisma } = await import("../lib/prisma");
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.tenant.tenantId },
        select: { status: true },
      });

      if (!tenant) {
        throw new UnauthorizedError("Tenant not found");
      }

      if (tenant.status !== "active") {
        throw new UnauthorizedError(`Tenant status: ${tenant.status}`);
      }

      // Cachear por 60s
      await redis.setEx(cacheKey, 60, tenant.status);

      next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      logger.error({ error }, "Tenant validation error");
      res.status(500).json({
        error: "Internal server error",
        code: "internal_error",
      });
    }
  })();
}

/**
 * Middleware para validar role
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(401).json({
        error: "Tenant context not found",
        code: "unauthorized",
      });
      return;
    }

    if (!roles.includes(req.tenant.role)) {
      res.status(403).json({
        error: "Insufficient permissions",
        code: "forbidden",
      });
      return;
    }

    next();
  };
}

/**
 * Middleware para validar super admin
 *
 * ⚠️  RULE: Existe apenas UM super_admin em todo o sistema, criado via .env no bootstrap.
 * Não há API endpoint para criar outro super_admin.
 * Este middleware apenas valida se o usuário autenticado TEM role "super_admin",
 * não o cria ou o modifica.
 *
 * Veja: src/services/admin.service.ts para a lógica de bootstrap.
 */
export const requireSuperAdmin = requireRole("super_admin");
