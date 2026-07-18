/**
 * Auth Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service";
import { validate } from "../middleware/validate";
import { EmailSchema } from "../types";

const router = Router();

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(6),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken é obrigatório"),
});

const LogoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken é obrigatório"),
});

const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

const ResetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  newPassword: z.string().min(8).max(100),
});

type LoginRequest = z.infer<typeof LoginSchema>;
type RefreshRequest = z.infer<typeof RefreshSchema>;
type LogoutRequest = z.infer<typeof LogoutSchema>;

/**
 * POST /auth/login
 * Retorna accessToken (JWT 15min) + refreshToken (opaco, 7 dias)
 */
router.post(
  "/login",
  validate(LoginSchema),
  async (req: Request<{}, {}, LoginRequest>, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/refresh
 * Troca refresh token válido por novo access token (com rotação do refresh token)
 */
router.post(
  "/refresh",
  validate(RefreshSchema),
  async (req: Request<{}, {}, RefreshRequest>, res: Response, next: NextFunction) => {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/logout
 * Revoga o refresh token — invalida a sessão
 */
router.post(
  "/logout",
  validate(LogoutSchema),
  async (req: Request<{}, {}, LogoutRequest>, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.body.refreshToken);
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
