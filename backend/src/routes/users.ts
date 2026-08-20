/**
 * Users Routes
 * Gerenciamento de usuários — CRUD com proteção de admin
 *
 * RULE: Apenas admin e super_admin podem criar, atualizar ou deletar usuários.
 * Todo usuário é isolado por tenantId do JWT.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { usersService } from "../services/users.service";
import { profilePhotosService } from "../services/profile-photos.service";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { logger } from "../lib/logger";
import { EmailSchema } from "../types";
import { strList, parseDate } from "../utils/query";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.union([EmailSchema, z.undefined()]),
  password: z.union([z.string().min(8).max(100), z.undefined()]),
  role: z.enum(["admin", "manager", "teacher", "student"]),
  document: z.union([z.string().max(20), z.undefined()]),
  enrollmentCode: z.union([z.string().max(50), z.undefined()]),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: EmailSchema.optional(),
  role: z.enum(["admin", "manager", "teacher", "student"]).optional(),
  document: z.union([z.string().max(20), z.null()]).optional(),
  enrollmentCode: z.union([z.string().max(50), z.null()]).optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// JPEG/PNG em base64, já redimensionado pelo navegador. O formato real é
// conferido pelos magic bytes no service.
const PhotoUploadSchema = z.object({
  imageB64: z.string().min(100),
});

type CreateUserRequest = z.infer<typeof CreateUserSchema>;
type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;
type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

/**
 * GET /users
 * Lista usuários do tenant (admin only)
 * Query params: page, limit, sortBy, sortOrder, search, role, status,
 * includeInactive (por padrão desativados ficam fora da lista)
 */
router.get(
  "/",
  authenticate,
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await usersService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
        role: strList(req.query.role),
        status: strList(req.query.status),
        facialStatus: strList(req.query.facialStatus),
        createdFrom: parseDate(req.query.created_from),
        createdTo: parseDate(req.query.created_to, true),
        includeInactive: req.query.includeInactive === "true",
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /users
 * Cria novo usuário (admin only)
 * Body: { name, email?, password?, role, document?, enrollmentCode? }
 */
router.post(
  "/",
  authenticate,
  requireRole("admin", "super_admin"),
  validate(CreateUserSchema),
  async (
    req: Request<{}, {}, CreateUserRequest>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await usersService.create({
        ...req.body,
        tenantId,
      });

      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /users/me/profile
 * Obtém perfil do usuário autenticado (qualquer role)
 * ⚠️ DEVE VIR ANTES de GET /:id para não conflitar
 */
router.get(
  "/me/profile",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant!;

      const result = await usersService.findById(userId, tenantId);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /users/me/photo
 * Foto de perfil do próprio usuário — self-service, qualquer cargo que tenha
 * acesso ao painel (alunos não têm login nem foto de perfil)
 * ⚠️ DEVE VIR ANTES de PUT /:id para não conflitar
 */
router.put(
  "/me/photo",
  authenticate,
  validate(PhotoUploadSchema),
  async (
    req: Request<{}, {}, z.infer<typeof PhotoUploadSchema>>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { tenantId, userId } = req.tenant!;
      const result = await profilePhotosService.setUserPhoto(
        tenantId,
        userId,
        req.body.imageB64,
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /users/me/photo
 * Remove a própria foto de perfil
 */
router.delete(
  "/me/photo",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant!;
      await profilePhotosService.deleteUserPhoto(tenantId, userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /users/:id/photo
 * Serve a foto de perfil. Visível para qualquer usuário autenticado do mesmo
 * tenant — é a foto que aparece ao lado do nome no painel.
 */
router.get(
  "/:id/photo",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const { stream, contentType } = await profilePhotosService.getUserPhotoStream(
        tenantId,
        req.params.id,
      );

      res.setHeader("Content-Type", contentType);
      // Privado e revalidado: a foto muda e não pode ficar em cache
      // compartilhado entre usuários
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      stream.on("error", (error) => {
        logger.error({ error, userId: req.params.id }, "Profile photo stream error");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to read photo", code: "internal_error" });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /users/:id/photo
 * Foto de perfil de outro usuário (admin/manager) — útil quando a secretaria
 * cadastra a equipe
 */
router.put(
  "/:id/photo",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  validate(PhotoUploadSchema),
  async (
    req: Request<{ id: string }, {}, z.infer<typeof PhotoUploadSchema>>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await profilePhotosService.setUserPhoto(
        tenantId,
        req.params.id,
        req.body.imageB64,
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /users/:id/photo
 */
router.delete(
  "/:id/photo",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      await profilePhotosService.deleteUserPhoto(tenantId, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /users/change-password
 * Altera senha do usuário autenticado
 * Usa tenantId e userId do JWT — sem parâmetro de ID
 * Body: { currentPassword, newPassword }
 * ⚠️ DEVE VIR ANTES de PUT /:id para não conflitar
 */
router.put(
  "/change-password",
  authenticate,
  validate(ChangePasswordSchema),
  async (
    req: Request<{}, {}, ChangePasswordRequest>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { tenantId, userId } = req.tenant!;
      await usersService.changePassword(userId, tenantId, req.body);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /users/:id/reset-password
 * Reset de senha — admin gera senha temporária para o usuário.
 * A senha é enviada por email; a API nunca a retorna em texto puro.
 */
router.post(
  "/:id/reset-password",
  authenticate,
  requireRole("admin", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      await usersService.resetPassword(req.params.id, tenantId);

      res.status(200).json({
        data: {
          userId: req.params.id,
          message: "Nova senha temporária enviada por email. Usuário deve alterá-la no primeiro login.",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /users/:id
 * Obtém um usuário específico (admin only)
 */
router.get(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await usersService.findById(req.params.id, tenantId);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /users/:id
 * Atualiza um usuário (admin only)
 * Body: { name?, email?, role?, status?, document?, enrollmentCode? }
 */
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  validate(UpdateUserSchema),
  async (
    req: Request<{ id: string }, {}, UpdateUserRequest>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { tenantId } = req.tenant!;

      const result = await usersService.update(req.params.id, tenantId, req.body);

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /users/:id
 * Deleta um usuário (admin only)
 * Não permite deletar super_admin
 */
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;

      await usersService.delete(req.params.id, tenantId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /users/:id/revoke-consent
 * LGPD — revoga consentimento biométrico: deleta embeddings imediatamente
 * e marca facial_status='revoked' (admin/manager)
 */
router.post(
  "/:id/revoke-consent",
  authenticate,
  requireRole("admin", "manager", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant!;

      await usersService.revokeConsent(req.params.id, tenantId, userId);

      res.json({ data: { revoked: true } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /users/:id/data
 * LGPD — exclusão definitiva dos dados biométricos (embeddings + tokens de
 * cadastro). O cadastro do usuário não é alterado (admin only)
 */
router.delete(
  "/:id/data",
  authenticate,
  requireRole("admin", "super_admin"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant!;

      await usersService.eraseUserData(req.params.id, tenantId, userId);

      res.json({ data: { erased: true } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
