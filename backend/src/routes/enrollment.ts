/**
 * Enrollment Routes — Fluxo de cadastro biométrico no totem (e a exclusão
 * dele pelo próprio aluno, em /erasure/*)
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
import { createEnrollmentLookupLimiter } from "../middleware/rateLimit";

export default function createEnrollmentRouter(): Router {
  const router = Router();

  // Limiter criado via factory (Redis precisa estar conectado)
  const lookupLimiter = createEnrollmentLookupLimiter();

  router.use(deviceAuth);

  // ── Schemas de validação ────────────────────────────────────────────────────

  // O totem envia `identifier` (CPF ou matrícula, conforme a instituição).
  // `document` é o nome antigo do campo — aceito para não quebrar totens que
  // ainda não recarregaram a página.
  const IdentifierSchema = z
    .object({
      identifier: z.string().min(3).max(50).optional(),
      document: z.string().min(3).max(50).optional(),
    })
    .refine((v) => Boolean(v.identifier ?? v.document), {
      message: "Informe o identificador do aluno",
      path: ["identifier"],
    });

  const SessionSchema = z.object({
    sessionId: z.string().length(32),
  });

  const FrameSchema = z.object({
    sessionId: z.string().length(32),
    imageB64: z.string().min(100),
  });

  // Rotas novas: só `identifier` (o alias `document` existe pelos totens antigos)
  const ErasureLookupSchema = z.object({
    identifier: z.string().min(3).max(50),
  });

  const ErasureConfirmSchema = ErasureLookupSchema.extend({
    imageB64: z.string().min(100),
  });

  type IdentifierRequest = z.infer<typeof IdentifierSchema>;
  type SessionRequest = z.infer<typeof SessionSchema>;
  type FrameRequest = z.infer<typeof FrameSchema>;
  type ErasureLookupRequest = z.infer<typeof ErasureLookupSchema>;
  type ErasureConfirmRequest = z.infer<typeof ErasureConfirmSchema>;

  /**
   * POST /enrollment/lookup
   * Confirmação de identidade pelo CPF ou matrícula digitados no totem
   * (não abre sessão). Rate-limited por device — sem isso, uma X-Device-Key
   * vazada vira oráculo de CPF (nome + status biométrico em volume).
   */
  router.post(
    "/lookup",
    lookupLimiter,
    validate(IdentifierSchema),
    async (req: Request<{}, {}, IdentifierRequest>, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const identifier = (req.body.identifier ?? req.body.document) as string;
        const result = await enrollmentService.lookupByIdentifier(tenantId, deviceId, identifier);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /enrollment/start
   * Abre sessão de cadastro para o aluno confirmado
   */
  router.post(
    "/start",
    lookupLimiter,
    validate(IdentifierSchema),
    async (req: Request<{}, {}, IdentifierRequest>, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const identifier = (req.body.identifier ?? req.body.document) as string;
        const result = await enrollmentService.startByIdentifier(tenantId, deviceId, identifier);
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

  /**
   * POST /enrollment/erasure/lookup
   * Exclusão da biometria pelo próprio aluno: acha o cadastro pelo CPF ou
   * matrícula e confirma que há o que apagar. Mesmo limiter do lookup do
   * cadastro — é o mesmo oráculo de identificador.
   */
  router.post(
    "/erasure/lookup",
    lookupLimiter,
    validate(ErasureLookupSchema),
    async (req: Request<{}, {}, ErasureLookupRequest>, res: Response, next: NextFunction) => {
      try {
        const { tenantId } = req.device!;
        const result = await enrollmentService.lookupForErasure(tenantId, req.body.identifier);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /enrollment/erasure/confirm
   * Reconhecimento 1:1 contra a biometria do próprio aluno — só apaga se o
   * rosto conferir. Também identifica o aluno pelo identificador, então fica
   * no mesmo limiter do lookup: com um teto maior, viraria o atalho do
   * oráculo de CPF.
   */
  router.post(
    "/erasure/confirm",
    lookupLimiter,
    validate(ErasureConfirmSchema),
    async (req: Request<{}, {}, ErasureConfirmRequest>, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const result = await enrollmentService.confirmErasure(
          tenantId,
          deviceId,
          req.body.identifier,
          req.body.imageB64
        );
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
