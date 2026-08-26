/**
 * Auth Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service";
import { validate } from "../middleware/validate";
import { EmailSchema } from "../types";
import { config } from "../lib/config";
import { UnauthorizedError } from "../utils/errors";

const router = Router();

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(6).max(100),
  // "Lembrar de mim": controla se o refresh token sobrevive ao fechamento do
  // navegador (cookie persistente) ou não (cookie de sessão).
  remember: z.boolean().optional(),
});

const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  newPassword: z.string().min(8).max(100),
});

type LoginRequest = z.infer<typeof LoginSchema>;

// ── Cookies httpOnly ─────────────────────────────────────────────────────────
// access_token e refresh_token nunca chegam ao JS do browser (httpOnly) nem
// trafegam em texto puro fora de TLS (secure fora de dev) — substituem o
// antigo par accessToken/refreshToken devolvido no corpo do JSON de login,
// que o frontend guardava em localStorage/sessionStorage.

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

function cookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict" as const,
    // Sem path restrito: o frontend acessa o backend via proxy same-origin
    // do Next.js (/api/*), então um Path=/auth setado aqui nunca bateria
    // com o path visto pelo browser (/api/auth/*).
    path: "/",
    ...(maxAgeSeconds !== undefined && { maxAge: maxAgeSeconds * 1000 }),
  };
}

function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  remember: boolean
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions(tokens.expiresIn));
  res.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    // remember=false -> cookie de sessão (sem maxAge), some ao fechar o navegador
    cookieOptions(remember ? config.jwtRefreshExpiresIn : undefined)
  );
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

/**
 * POST /auth/login
 * Autentica e seta access_token + refresh_token como cookies httpOnly.
 */
router.post(
  "/login",
  validate(LoginSchema),
  async (req: Request<{}, {}, LoginRequest>, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      setAuthCookies(res, result, req.body.remember ?? true);
      res.json({ data: { user: result.user, expiresIn: result.expiresIn } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/refresh
 * Troca o refresh token do cookie por um novo par (rotação), sem nada no body.
 */
router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      if (!refreshToken) {
        throw new UnauthorizedError("Refresh token ausente");
      }
      const result = await authService.refresh(refreshToken);
      // "Lembrar de mim" atravessa a rotação — vem gravado junto do refresh
      // token no Redis desde o login (auth.service.ts).
      setAuthCookies(res, result, result.remember);
      res.json({ data: { expiresIn: result.expiresIn } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/logout
 * Revoga o refresh token do cookie — invalida a sessão — e limpa os cookies.
 */
router.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      clearAuthCookies(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/forgot-password
 * Envia link de redefinição por email. Resposta constante — não vaza contas.
 */
router.post(
  "/forgot-password",
  validate(ForgotPasswordSchema),
  async (req: Request<{}, {}, z.infer<typeof ForgotPasswordSchema>>, res: Response, next: NextFunction) => {
    try {
      await authService.requestPasswordReset(req.body.email);
      res.json({
        data: { sent: true },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/reset-password
 * Consome o token de uso único (15min) e define a nova senha.
 */
router.post(
  "/reset-password",
  validate(ResetPasswordSchema),
  async (req: Request<{}, {}, z.infer<typeof ResetPasswordSchema>>, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.body.token, req.body.newPassword);
      res.json({ data: { reset: true } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
