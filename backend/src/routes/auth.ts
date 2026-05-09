/**
 * Auth Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { login, refreshAccessToken, logout } from "../services/auth.service";
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
      const result = await login(req.body);
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
      const result = await refreshAccessToken(req.body.refreshToken);
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
      await logout(req.body.refreshToken);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
