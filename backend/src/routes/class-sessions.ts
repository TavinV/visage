/**
 * Class Sessions Routes
 *
 * A chamada pertence ao PROFESSOR: teacher abre, cancela, encerra e ajusta
 * as próprias sessões; admin/super_admin operam qualquer sessão do tenant;
 * manager tem leitura. Ownership é resolvido por sessão (teacherId do JWT).
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { classSessionsService } from "../services/class-sessions.service";
import { auditService } from "../services/audit.service";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { sseService } from "../services/sse.service";
import { config } from "../lib/config";
import { JWTPayload } from "../types";
import { logger } from "../lib/logger";

const router = Router();

// ── Schemas de validação ──────────────────────────────────────────────────────

// O professor informa apenas a sala e a hora real em que a aula começou.
// Quanto a chamada vale em aulas vem da disciplina (secretaria).
const CreateSessionSchema = z.object({
  /** A chamada é de uma disciplina da turma. */
  classSubjectId: z.string().uuid(),
  /** Ignorado para professores — a sessão é sempre deles. */
  teacherId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  /** ISO 8601. Default: agora. Aceita passado (chamada aberta com atraso). */
  startedAt: z.string().datetime({ offset: true }).optional(),
});

const UpdateSessionSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
});

const SetAttendanceSchema = z.object({
  classesCounted: z.number().int().min(0),
});

type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;
type UpdateSessionRequest = z.infer<typeof UpdateSessionSchema>;

const READ_ROLES = ["admin", "manager", "teacher", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];

/**
 * Professores só operam as próprias sessões; admin/manager veem tudo.
 * Retorna false (e responde 403) quando o acesso é negado.
 */
async function assertSessionAccess(
  req: Request<{ id: string }>,
  res: Response,
  opts: { write: boolean }
): Promise<boolean> {
  const { tenantId, userId, role } = req.tenant!;
  if (ADMIN_ROLES.includes(role)) return true;
  if (!opts.write && role === "manager") return true;
  if (role === "teacher") {
    const session = await classSessionsService.findById(req.params.id, tenantId);
    if (session.teacherId === userId) return true;
  }
  res.status(403).json({ error: "Forbidden", code: "forbidden" });
  return false;
}

/**
 * GET /class-sessions
 * Lista sessões do tenant. Professor recebe apenas as suas.
 */
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId, role } = req.tenant!;

      if (!READ_ROLES.includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      const result = await classSessionsService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        classId: req.query.classId as string | undefined,
        classSubjectId: req.query.classSubjectId as string | undefined,
        status: req.query.status as "open" | "closed" | "cancelled" | undefined,
        // Professor: escopo travado nas próprias sessões
        teacherId: role === "teacher" ? userId : undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions
 * Abre uma chamada. Professor abre para si; admin pode indicar o professor.
 */
router.post(
  "/",
  authenticate,
  validate(CreateSessionSchema),
  async (req: Request<{}, {}, CreateSessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId, role } = req.tenant!;

      if (!["teacher", ...ADMIN_ROLES].includes(role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      // Professor sempre abre a própria chamada; admin escolhe o responsável
      const teacherId = role === "teacher" ? userId : req.body.teacherId;
      if (!teacherId) {
        res.status(400).json({
          error: "Informe o professor responsável pela chamada",
          code: "validation_error",
        });
        return;
      }

      const result = await classSessionsService.create({
        tenantId,
        createdById: userId,
        classSubjectId: req.body.classSubjectId,
        teacherId,
        locationId: req.body.locationId,
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : undefined,
      });

      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id
 * Obtém uma sessão (professor: apenas as suas)
 */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: false }))) return;

      const result = await classSessionsService.findById(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /class-sessions/:id
 * Atualiza uma sessão (professor: apenas as suas)
 */
router.patch(
  "/:id",
  authenticate,
  validate(UpdateSessionSchema),
  async (req: Request<{ id: string }, {}, UpdateSessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: true }))) return;

      const result = await classSessionsService.update(req.params.id, tenantId, {
        status: req.body.status,
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : undefined,
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id/rollcall
 * Chamada completa: matriculados + presenças mescladas + estatísticas
 */
router.get(
  "/:id/rollcall",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: false }))) return;

      const result = await classSessionsService.rollcall(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /class-sessions/:id/attendance/:userId
 * Override manual: quantas aulas o aluno conta nesta sessão (0 = ausente)
 */
router.put(
  "/:id/attendance/:userId",
  authenticate,
  validate(SetAttendanceSchema),
  async (
    req: Request<{ id: string; userId: string }, {}, z.infer<typeof SetAttendanceSchema>>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, userId: adjustedById } = req.tenant!;
      if (!(await assertSessionAccess(req as unknown as Request<{ id: string }>, res, { write: true }))) return;

      const result = await classSessionsService.setAttendance(
        req.params.id,
        tenantId,
        req.params.userId,
        req.body.classesCounted,
        adjustedById
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions/:id/checkout/:userId
 * Libera a saída antecipada do aluno. O horário só é gravado quando ele
 * passa no totem — aqui apenas a autorização do professor é registrada.
 */
router.post(
  "/:id/checkout/:userId",
  authenticate,
  async (
    req: Request<{ id: string; userId: string }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId, userId: releasedById } = req.tenant!;
      if (!(await assertSessionAccess(req as unknown as Request<{ id: string }>, res, { write: true }))) return;

      const result = await classSessionsService.releaseCheckout(
        req.params.id,
        tenantId,
        req.params.userId,
        releasedById
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /class-sessions/:id/checkout/:userId
 * Desfaz a liberação, enquanto o aluno ainda não passou no totem
 */
router.delete(
  "/:id/checkout/:userId",
  authenticate,
  async (
    req: Request<{ id: string; userId: string }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req as unknown as Request<{ id: string }>, res, { write: true }))) return;

      const result = await classSessionsService.revokeCheckoutRelease(
        req.params.id,
        tenantId,
        req.params.userId
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id/frames
 * Tentativas de fraude na janela/sala desta sessão
 */
router.get(
  "/:id/frames",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: false }))) return;

      const result = await classSessionsService.listFrames(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id/frames/:logId
 * Stream do JPEG de um fraud frame da própria aula (professor incluído)
 */
router.get(
  "/:id/frames/:logId",
  authenticate,
  async (req: Request<{ id: string; logId: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req as unknown as Request<{ id: string }>, res, { write: false }))) return;

      // O frame precisa pertencer à janela/sala desta sessão
      const belongs = await classSessionsService.frameBelongsToSession(
        req.params.id,
        tenantId,
        req.params.logId
      );
      if (!belongs) {
        res.status(404).json({ error: "Frame não pertence a esta chamada", code: "not_found" });
        return;
      }

      const stream = await auditService.getFraudFrameStream(tenantId, req.params.logId);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, no-store");
      stream.on("error", (error) => {
        logger.error({ error, logId: req.params.logId }, "Session fraud frame stream error");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to read fraud frame", code: "internal_error" });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id/records
 * Lista attendance_records da sessão (carga inicial do painel)
 */
router.get(
  "/:id/records",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: false }))) return;

      const result = await classSessionsService.listRecords(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /class-sessions/:id/stream
 * SSE — presenças em tempo real para o painel do professor.
 *
 * EventSource não envia headers customizados, então o JWT também é aceito
 * via query string (?token=). Mesma validação/expiração do header Bearer.
 */
router.get(
  "/:id/stream",
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined;
      const token = bearer ?? (req.query.token as string | undefined);

      if (!token) {
        res.status(401).json({ error: "Missing token", code: "unauthorized" });
        return;
      }

      let payload: JWTPayload;
      try {
        payload = jwt.verify(token, config.jwtSecret) as unknown as JWTPayload;
      } catch {
        res.status(401).json({ error: "Invalid token", code: "invalid_token" });
        return;
      }

      if (!READ_ROLES.includes(payload.role)) {
        res.status(403).json({ error: "Forbidden", code: "forbidden" });
        return;
      }

      // Garante que a sessão pertence ao tenant do JWT antes de abrir o stream
      await classSessionsService.findById(req.params.id, payload.tenantId);

      sseService.addClient(
        sseService.sessionChannel(payload.tenantId, req.params.id),
        res
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions/:id/close
 * Encerra a chamada e consolida presenças/faltas
 */
router.post(
  "/:id/close",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: true }))) return;

      const result = await classSessionsService.close(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /class-sessions/:id/cancel
 * Cancela uma chamada aberta por engano — nada é consolidado
 */
router.post(
  "/:id/cancel",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!(await assertSessionAccess(req, res, { write: true }))) return;

      const result = await classSessionsService.cancel(req.params.id, tenantId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
