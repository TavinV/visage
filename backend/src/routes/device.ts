/**
 * Device Routes — Totem (autenticadas via X-Device-Key)
 *
 * POST /device/recognize        — hot path do reconhecimento (100 req/min/device)
 * GET  /device/session/current  — sessão ativa na sala do totem
 * GET  /device/heartbeat        — atualiza last_seen_at (10 req/min/device)
 * GET  /device/stream           — SSE: eventos em tempo real
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { recognitionService } from "../services/recognition.service";
import { calibrationService } from "../services/calibration.service";
import { sseService } from "../services/sse.service";
import { deviceAuth } from "../middleware/deviceAuth";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";
import { resolveIdentification } from "../utils/identification";
import {
  createDeviceRecognizeLimiter,
  createDeviceHeartbeatLimiter,
} from "../middleware/rateLimit";

export default function createDeviceRouter(): Router {
  const router = Router();

  // Limiters criados via factory (Redis precisa estar conectado)
  const recognizeLimiter = createDeviceRecognizeLimiter();
  const heartbeatLimiter = createDeviceHeartbeatLimiter();

  router.use(deviceAuth);

  const RecognizeSchema = z.object({
    imageB64: z.string().min(100),
  });

  type RecognizeRequest = z.infer<typeof RecognizeSchema>;

  /**
   * POST /device/recognize
   * Hot path — frame JPEG base64, resposta mínima (nunca embeddings)
   */
  router.post(
    "/recognize",
    recognizeLimiter,
    validate(RecognizeSchema),
    async (req: Request<{}, {}, RecognizeRequest>, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId, locationId } = req.device!;
        const result = await recognitionService.recognize({
          tenantId,
          deviceId,
          locationId,
          imageB64: req.body.imageB64,
        });
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /device/context
   * Identidade do totem para a UI: instituição, fuso do relógio e o template
   * da senha do painel oculto (o totem valida localmente com {{data}}/{{hora}})
   */
  router.get(
    "/context",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const [tenant, settings, device] = await Promise.all([
          prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
          prisma.tenantSettings.findUnique({
            where: { tenantId },
            select: {
              totemPanelPassword: true,
              totemClockTimezone: true,
              studentIdentification: true,
              totemIdentification: true,
            },
          }),
          prisma.device.findUnique({
            where: { id: deviceId },
            select: { label: true, allowEnrollment: true },
          }),
        ]);
        // O totem monta a tela de identificação a partir daqui: rótulo,
        // máscara e teclado mudam entre CPF e matrícula
        const identification = resolveIdentification(settings);

        res.json({
          data: {
            tenantName: tenant?.name ?? "",
            deviceLabel: device?.label ?? null,
            clockTimezone: settings?.totemClockTimezone ?? "local",
            panelPassword: settings?.totemPanelPassword ?? null,
            allowEnrollment: device?.allowEnrollment ?? false,
            totemIdentification: identification.totemIdentification,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /device/calibration
   * O totem sonda a fase/progresso da calibração guiada (ou inatividade)
   */
  router.get(
    "/calibration",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const result = await calibrationService.progressForDevice(tenantId, deviceId);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  const CalibrationSampleSchema = z.object({
    imageB64: z.string().min(100),
  });

  /**
   * POST /device/calibration/sample
   * Foto da fase atual (pessoa legítima, impostor ou ataque) — vive no Redis
   */
  router.post(
    "/calibration/sample",
    recognizeLimiter,
    validate(CalibrationSampleSchema),
    async (
      req: Request<{}, {}, z.infer<typeof CalibrationSampleSchema>>,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const result = await calibrationService.addSample(tenantId, deviceId, req.body.imageB64);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  const CalibrationAdvanceSchema = z.object({
    action: z.enum(["next-person", "next-phase"]),
  });

  /**
   * POST /device/calibration/advance
   * Operador no totem avança de pessoa ou de fase
   */
  router.post(
    "/calibration/advance",
    validate(CalibrationAdvanceSchema),
    async (
      req: Request<{}, {}, z.infer<typeof CalibrationAdvanceSchema>>,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const { tenantId, deviceId } = req.device!;
        const result = await calibrationService.advance(tenantId, deviceId, req.body.action);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /device/session/current
   * Sessão de chamada aberta vinculada à localização do totem (ou null)
   */
  router.get(
    "/session/current",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { tenantId, locationId } = req.device!;
        const result = await recognitionService.getCurrentSession(tenantId, locationId);
        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /device/heartbeat
   * Atualiza devices.last_seen_at
   */
  router.get(
    "/heartbeat",
    heartbeatLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { tenantId, deviceId } = req.device!;
        await recognitionService.heartbeat(tenantId, deviceId);
        res.json({ data: { ok: true } });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /device/stream
   * SSE — reconhecimentos realizados e sessão encerrada
   */
  router.get("/stream", (req: Request, res: Response) => {
    const { tenantId, deviceId } = req.device!;
    sseService.addClient(sseService.deviceChannel(tenantId, deviceId), res);
  });

  return router;
}
