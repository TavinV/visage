/**
 * Auth Service
 * Login, refresh de access token e logout
 */

import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { UnauthorizedError } from "../utils/errors";

const REFRESH_PREFIX = "rtoken:";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Segundos até expirar o access token */
  expiresIn: number;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
}

interface RefreshPayload {
  userId: number;
  tenantId: number;
  role: string;
  email: string;
}

function generateAccessToken(payload: RefreshPayload): string {
  return jwt.sign(
    {
      sub: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

async function storeRefreshToken(
  token: string,
  payload: RefreshPayload
): Promise<void> {
  await redis.setEx(
    `${REFRESH_PREFIX}${token}`,
    config.jwtRefreshExpiresIn,
    JSON.stringify(payload)
  );
}

/**
 * Login via email + password
 * Retorna access token (JWT de curta duração) e refresh token (opaco, armazenado no Redis)
 */
export async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await prisma.user.findFirst({
    where: { email: input.email },
    include: { tenant: true },
  });

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordMatch = await bcryptjs.compare(input.password, user.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.status !== "active") {
    throw new UnauthorizedError(`User status: ${user.status}`);
  }

  if (user.tenant.status !== "active") {
    throw new UnauthorizedError(`Tenant status: ${user.tenant.status}`);
  }

  const rtPayload: RefreshPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email ?? "",
  };

  const accessToken = generateAccessToken(rtPayload);
  const refreshToken = crypto.randomBytes(32).toString("hex");

  await storeRefreshToken(refreshToken, rtPayload);

  logger.info({ userId: user.id, tenantId: user.tenantId }, "User logged in");

  return {
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutos em segundos (alinhado com JWT_EXPIRES_IN=15m)
    user: {
      id: user.id,
      email: user.email ?? "",
      name: user.name,
      role: user.role,
    },
  };
}

/**
 * Troca um refresh token válido por um novo access token
 * Implementa rotação: invalida o refresh token usado e emite um novo
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Pick<AuthTokens, "accessToken" | "refreshToken" | "expiresIn">> {
  const key = `${REFRESH_PREFIX}${refreshToken}`;
  const raw = await redis.get(key);

  if (!raw) {
    throw new UnauthorizedError("Refresh token inválido ou expirado");
  }

  const payload = JSON.parse(raw) as RefreshPayload;

  // Rotação: invalida o token atual e emite novo
  await redis.del(key);

  const newRefreshToken = crypto.randomBytes(32).toString("hex");
  await storeRefreshToken(newRefreshToken, payload);

  const accessToken = generateAccessToken(payload);

  logger.info({ userId: payload.userId }, "Access token refreshed");

  return { accessToken, refreshToken: newRefreshToken, expiresIn: 900 };
}

/**
 * Revoga o refresh token (logout)
 */
export async function logout(refreshToken: string): Promise<void> {
  await redis.del(`${REFRESH_PREFIX}${refreshToken}`);
}
