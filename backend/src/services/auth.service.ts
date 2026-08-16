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
import { auditService } from "./audit.service";
import { setActor } from "../lib/requestContext";

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
  /** auth_sessions.id — atravessa a rotação do refresh token para que toda a
   *  atividade do usuário fique amarrada ao mesmo login. */
  sessionId?: string;
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
        // Carimba a sessão no token — é assim que cada ação no console sabe a
        // qual login ela pertence, sem consulta extra a cada requisição
        ...(payload.sessionId && { sid: payload.sessionId }),
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
      // E-mail desconhecido: não há instituição para atribuir o evento, então
      // ele nasce global e só o super_admin enxerga. A resposta ao cliente
      // continua genérica — a trilha sabe mais do que o atacante.
      this.recordFailedLogin(input.email, "unknown_account", user ?? undefined);
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordMatch = await bcryptjs.compare(input.password, user.passwordHash);
    if (!passwordMatch) {
      this.recordFailedLogin(input.email, "wrong_password", user);
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status !== "active") {
      this.recordFailedLogin(input.email, `user_status:${user.status}`, user);
      throw new UnauthorizedError(`User status: ${user.status}`);
    }

    if (user.tenant.status !== "active") {
      this.recordFailedLogin(input.email, `tenant_status:${user.tenant.status}`, user);
      throw new UnauthorizedError(`Tenant status: ${user.tenant.status}`);
    }

    // Abre a sessão ANTES de emitir o token: o id da sessão entra no JWT, e
    // toda ação subsequente do usuário já nasce amarrada a este login.
    const sessionId = await auditService.openSession({
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    const rtPayload: RefreshPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email ?? "",
      sessionId,
    };

    const accessToken = this.generateAccessToken(rtPayload);
    const refreshToken = crypto.randomBytes(32).toString("hex");
    await this.storeRefreshToken(refreshToken, rtPayload);

    // A requisição de login não passou por `authenticate`, então o contexto
    // ainda está anônimo — preenche o ator para que o evento saia completo
    setActor({
      actorType: "user",
      tenantId: user.tenantId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email ?? undefined,
      userRole: user.role,
      sessionId,
    });

    auditService.record({
      action: "auth.login",
      tenantId: user.tenantId,
      targetId: user.id,
      targetLabel: user.name,
      details: `Login no console como ${user.role}`,
    });

    this.logger.info({ userId: user.id, tenantId: user.tenantId, sessionId }, "User logged in");

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

    // O refresh é a única prova de que a sessão continua viva — sem isso, uma
    // sessão de 6 horas apareceria na auditoria com "última atividade" no login
    if (payload.sessionId) {
      await auditService.touchSession(payload.sessionId);
    }

    this.logger.info({ userId: payload.userId }, "Access token refreshed");

    return { accessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /**
   * Revoga o refresh token (logout) e fecha a sessão de auditoria.
   *
   * O refresh token guarda o sessionId, então o logout consegue fechar a sessão
   * mesmo quando o access token já expirou e o cliente só tem o refresh.
   */
  async logout(refreshToken: string): Promise<void> {
    const key = `${REFRESH_PREFIX}${refreshToken}`;
    const raw = await redis.get(key);
    await redis.del(key);

    if (!raw) return;

    let payload: RefreshPayload;
    try {
      payload = JSON.parse(raw) as RefreshPayload;
    } catch {
      return; // token corrompido no Redis — nada a registrar
    }

    if (!payload.sessionId) return;

    auditService.record({
      action: "auth.logout",
      tenantId: payload.tenantId,
      targetId: payload.userId,
      actor: {
        type: "user",
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
      },
    });

    await auditService.closeSession(payload.sessionId, "logout");
  }

  /**
   * Registra tentativa de login malsucedida.
   *
   * Sem usuário conhecido o evento fica sem instituição (tenantId null) e só o
   * super_admin o vê — é ele quem investiga varredura de credenciais contra a
   * plataforma. Com usuário conhecido, o admin da instituição também precisa
   * ver que houve tentativa contra aquela conta.
   */
  private recordFailedLogin(
    email: string,
    reason: string,
    user?: { id: string; tenantId: string; name: string; role: string },
  ): void {
    auditService.record({
      action: "auth.login_failed",
      status: "failure",
      tenantId: user?.tenantId ?? null,
      targetId: user?.id,
      targetLabel: user?.name ?? email,
      details: `Tentativa de login para ${email}`,
      metadata: { email, reason },
      actor: {
        // Sem senha correta não há identidade comprovada: o ator é anônimo,
        // ainda que o e-mail digitado aponte para uma conta existente
        type: "anonymous",
        name: email,
        email,
      },
    });
  }

  // ── Redefinição de senha ─────────────────────────────────────────────────────

  /**
   * Gera token de redefinição (uso único, TTL curtíssimo) e envia por email.
   * Resposta idêntica exista ou não a conta — não vaza cadastros.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, tenantId: true, name: true, email: true, role: true, passwordHash: true },
    });
    // Só contas com senha (alunos não têm acesso ao painel)
    if (!user || !user.passwordHash || !user.email) return;

    auditService.record({
      action: "auth.password_reset_requested",
      tenantId: user.tenantId,
      targetId: user.id,
      targetLabel: user.name,
      details: `Link de redefinição de senha enviado para ${user.email}`,
      actor: { type: "anonymous", name: user.name, email: user.email, role: user.role },
    });

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
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true, tenantId: true, name: true, email: true, role: true },
    });

    auditService.record({
      action: "auth.password_reset_completed",
      tenantId: user.tenantId,
      targetId: user.id,
      targetLabel: user.name,
      details: "Senha redefinida pelo link enviado por e-mail",
      // Quem redefine ainda não está logado — a posse do link é a prova
      actor: {
        type: "anonymous",
        userId: user.id,
        name: user.name,
        email: user.email ?? undefined,
        role: user.role,
      },
    });

    this.logger.info({ userId }, "Password reset via email token");
  }
}

export const authService = new AuthService();
