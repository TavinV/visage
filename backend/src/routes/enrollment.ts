/**
 * Enrollment Routes — Fluxo de cadastro biométrico no totem
 *
 * Todas as rotas são autenticadas por X-Device-Key (deviceAuth): o totem é
 * o único cliente deste fluxo. A sessão de cadastro vive no Redis (TTL 10min)
 * e é validada contra o tenant do dispositivo em cada request.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { enrollmentService } from "../services/enrollment.service";
import { deviceAuth } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";

const router = Router();

router.use(deviceAuth);

// ── Schemas de validação ──────────────────────────────────────────────────────

const ValidateTokenSchema = z.object({
  token: z.string().min(16).max(128),
});

const DocumentSchema = z.object({
  document: z.string().min(11).max(20),
});

const SessionSchema = z.object({
  sessionId: z.string().length(32),
});

const FrameSchema = z.object({
  sessionId: z.string().length(32),
  imageB64: z.string().min(100),
});

type ValidateTokenRequest = z.infer<typeof ValidateTokenSchema>;
type DocumentRequest = z.infer<typeof DocumentSchema>;
type SessionRequest = z.infer<typeof SessionSchema>;
type FrameRequest = z.infer<typeof FrameSchema>;

/**
 * POST /enrollment/lookup
 * Confirmação de identidade pelo CPF digitado no totem (não abre sessão)
 */
router.post(
  "/lookup",
  validate(DocumentSchema),
  async (req: Request<{}, {}, DocumentRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, deviceId } = req.device!;
      const result = await enrollmentService.lookupByDocument(tenantId, deviceId, req.body.document);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/start
 * Abre sessão de cadastro para o aluno confirmado pelo CPF
 */
router.post(
  "/start",
  validate(DocumentSchema),
  async (req: Request<{}, {}, DocumentRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, deviceId } = req.device!;
      const result = await enrollmentService.startByDocument(tenantId, deviceId, req.body.document);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/validate-token
 * Totem envia token escaneado — consumo atômico de uso único
 */
router.post(
  "/validate-token",
  validate(ValidateTokenSchema),
  async (req: Request<{}, {}, ValidateTokenRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, deviceId, deviceFingerprint } = req.device!;
      const result = await enrollmentService.validateToken(
        tenantId,
        deviceId,
        req.body.token,
        deviceFingerprint
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/consent
 * Registra aceite do regulamento LGPD (biometric_consents)
 */
router.post(
  "/consent",
  validate(SessionSchema),
  async (req: Request<{}, {}, SessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId, deviceFingerprint } = req.device!;
      const ipAddress = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const result = await enrollmentService.registerConsent(
        tenantId,
        req.body.sessionId,
        deviceFingerprint,
        ipAddress
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/refuse
 * Registra recusa de consentimento — nenhum embedding é criado
 */
router.post(
  "/refuse",
  validate(SessionSchema),
  async (req: Request<{}, {}, SessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.device!;
      await enrollmentService.registerRefusal(tenantId, req.body.sessionId);
      res.json({ data: { refused: true } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/frame
 * Frame JPEG (base64) da captura multi-frame — liveness rigoroso na engine
 */
router.post(
  "/frame",
  validate(FrameSchema),
  async (req: Request<{}, {}, FrameRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.device!;
      const result = await enrollmentService.processFrame(
        tenantId,
        req.body.sessionId,
        req.body.imageB64
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /enrollment/finalize
 * Consolida embedding (média vetorial na engine) e conclui o cadastro
 */
router.post(
  "/finalize",
  validate(SessionSchema),
  async (req: Request<{}, {}, SessionRequest>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.device!;
      const result = await enrollmentService.finalize(tenantId, req.body.sessionId);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
