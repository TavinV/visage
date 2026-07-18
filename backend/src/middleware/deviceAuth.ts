/**
 * Device authentication middleware
 * Autentica totens via header X-Device-Key (API Key gerada em POST /devices).
 *
 * A chave nunca é armazenada em plaintext — comparação por SHA-256 contra
 * devices.api_key_hash (índice dedicado, hot path). Popula req.tenant no
 * mesmo formato do JWT (role "device") e req.device com contexto do totem.
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { DeviceContext } from "../types";

declare global {
  namespace Express {
    interface Request {
      device?: DeviceContext;
    }
  }
}

function unauthorized(res: Response, message: string): void {
  res.status(401).json({ error: message, code: "unauthorized" });
}

export function deviceAuth(req: Request, res: Response, next: NextFunction): void {
  (async () => {
    try {
      const apiKey = req.headers["x-device-key"];
      if (!apiKey || typeof apiKey !== "string") {
        unauthorized(res, "Missing X-Device-Key header");
        return;
      }

      const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      const device = await prisma.device.findFirst({
        where: { apiKeyHash },
        select: {
          id: true,
          tenantId: true,
          locationId: true,
          deviceFingerprint: true,
          isActive: true,
        },
      });

      if (!device || !device.isActive) {
        unauthorized(res, "Invalid or inactive device key");
        return;
      }

      // Bloquear tenants suspensos/cancelados (cache Redis 60s, mesmo padrão do JWT)
      const cacheKey = `tenant:status:${device.tenantId}`;
      let status = await redis.get(cacheKey);
      if (!status) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: device.tenantId },
          select: { status: true },
        });
        if (!tenant) {
          unauthorized(res, "Tenant not found");
          return;
        }
        status = tenant.status;
        await redis.setEx(cacheKey, 60, status);
      }

      if (status !== "active" && status !== "trial") {
        unauthorized(res, `Tenant status: ${status}`);
        return;
      }

      req.device = {
        deviceId: device.id,
        tenantId: device.tenantId,
        locationId: device.locationId ?? undefined,
        deviceFingerprint: device.deviceFingerprint,
      };

      // Mesmo formato do contexto JWT — serviços continuam lendo req.tenant.tenantId
      req.tenant = {
        tenantId: device.tenantId,
        userId: device.id,
        role: "device",
        email: "",
      };

      next();
    } catch (error) {
      logger.error({ error }, "Device authentication error");
      res.status(500).json({ error: "Internal server error", code: "internal_error" });
    }
  })();
}
