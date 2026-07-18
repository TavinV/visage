/**
 * AuthService
 * Login, refresh de access token e logout.
 * Estende BaseService para acesso centralizado ao prisma e logger.
 */

import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { config } from "../lib/config";
import { redis } from "../lib/redis";
import { UnauthorizedError } from "../utils/errors";
import { BaseService } from "./base.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

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
    id: string;
    email: string;
    name: string;
    role: string;
    /** Senha temporária em uso — o frontend força a troca antes do console */
    mustChangePassword: boolean;
  };
}

interface RefreshPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const REFRESH_PREFIX = "rtoken:";
const RESET_PREFIX = "pwdreset:";
const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutos
const RESET_TTL_SECONDS = 900; // link de redefinição vive só 15 minutos

// ── Serviço ───────────────────────────────────────────────────────────────────

class AuthService extends BaseService {
  // ── Helpers privados ───────────────────────────────────────────────────────

  private generateAccessToken(payload: RefreshPayload): string {
    return jwt.sign(
      {
        sub: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
    );
  }

  private async storeRefreshToken(
    token: string,
    payload: RefreshPayload,
  ): Promise<void> {
    await redis.setEx(
      `${REFRESH_PREFIX}${token}`,
      config.jwtRefreshExpiresIn,
      JSON.stringify(payload),
    );
  }

  // ── Métodos públicos ────────────────────────────────────────────────────────

  /**
   * Login via email + password.
   * Retorna access token (JWT curta duração) e refresh token (opaco, Redis).
   */
  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
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

    const accessToken = this.generateAccessToken(rtPayload);
    const refreshToken = crypto.randomBytes(32).toString("hex");
    await this.storeRefreshToken(refreshToken, rtPayload);

    this.logger.info({ userId: user.id, tenantId: user.tenantId }, "User logged in");

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email ?? "",
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false,
      },
    };
  }

  /**
   * Troca refresh token válido por novo access token.
   * Implementa rotação: invalida o token atual e emite novo.
   */
  async refresh(
    refreshToken: string,
  ): Promise<Pick<AuthTokens, "accessToken" | "refreshToken" | "expiresIn">> {
    const key = `${REFRESH_PREFIX}${refreshToken}`;
    const raw = await redis.get(key);

    if (!raw) {
      throw new UnauthorizedError("Refresh token inválido ou expirado");
    }

    const payload = JSON.parse(raw) as RefreshPayload;

    await redis.del(key);
    const newRefreshToken = crypto.randomBytes(32).toString("hex");
    await this.storeRefreshToken(newRefreshToken, payload);

    const accessToken = this.generateAccessToken(payload);

    this.logger.info({ userId: payload.userId }, "Access token refreshed");

    return { accessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /**
   * Revoga o refresh token (logout).
   */
  async logout(refreshToken: string): Promise<void> {
    await redis.del(`${REFRESH_PREFIX}${refreshToken}`);
  }

  // ── Redefinição de senha ─────────────────────────────────────────────────────

  /**
   * Gera token de redefinição (uso único, TTL curtíssimo) e envia por email.
   * Resposta idêntica exista ou não a conta — não vaza cadastros.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    // Só contas com senha (alunos não têm acesso ao painel)
    if (!user || !user.passwordHash || !user.email) return;

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await redis.set(
      `${RESET_PREFIX}${tokenHash}`,
      user.id,
      { EX: RESET_TTL_SECONDS }
    );

    const { emailService } = await import("./email.service");
    try {
      await emailService.send({
        to: user.email,
        templateId: "password-reset",
        context: {
          name: user.name,
          resetUrl: `${config.frontendUrl}/reset-password?token=${token}`,
          expiresIn: "15 minutos",
        },
      });
    } catch (error) {
      this.logger.warn({ userId: user.id, error }, "Failed to send password reset email");
    }
  }

  /**
   * Consome o token (GETDEL — uso único mesmo sob concorrência) e troca a senha.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const userId = await redis.getDel(`${RESET_PREFIX}${tokenHash}`);
    if (!userId) {
      throw new UnauthorizedError("Link de redefinição inválido ou expirado");
    }

    const passwordHash = await bcryptjs.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    this.logger.info({ userId }, "Password reset via email token");
  }
}

export const authService = new AuthService();
