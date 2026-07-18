/**
 * AuditService
 * Consulta de recognition_logs e acesso restrito a fraud frames.
 *
 * RULE (LGPD): fraud frames só são servidos após validar JWT + role
 * admin/manager + tenant_id do log == tenant_id do JWT. O path do arquivo
 * NUNCA é exposto na resposta — o Node serve o JPEG via stream.
 */

import fs from "fs";
import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ForbiddenError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface ListRecognitionLogsParams extends ListParams {
  tenantId?: string; // ausente apenas na visão global do super_admin
  date?: string; // YYYY-MM-DD
  status?: string;
  userId?: string;
  deviceId?: string;
}

export interface RecognitionLogOutput {
  id: string;
  tenantId: string;
  deviceId?: string;
  userId?: string;
  userName?: string;
  status: string;
  confidence?: number;
  livenessScore?: number;
  saturationMean?: number;
  processingMs?: number;
  fraudFrameExists: boolean;
  createdAt: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class AuditService extends BaseService {
  /**
   * Lista recognition_logs. Com tenantId → visão do tenant;
   * sem tenantId → visão global (SOMENTE super_admin, validado na rota).
   */
  async listRecognitionLogs(
    params: ListRecognitionLogsParams
  ): Promise<PaginatedResult<RecognitionLogOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);

    let dateFilter: { gte: Date; lt: Date } | undefined;
    if (params.date) {
      const dayStart = new Date(`${params.date}T00:00:00.000Z`);
      if (!Number.isNaN(dayStart.getTime())) {
        dateFilter = {
          gte: dayStart,
          lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
        };
      }
    }

    const where = {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.status && { status: params.status }),
      ...(params.userId && { userId: params.userId }),
      ...(params.deviceId && { deviceId: params.deviceId }),
      ...(dateFilter && { createdAt: dateFilter }),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.recognitionLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      this.prisma.recognitionLog.count({ where }),
    ]);

    return this.buildPaginatedResult(
      logs.map((log) => ({
        id: log.id,
        tenantId: log.tenantId,
        deviceId: log.deviceId ?? undefined,
        userId: log.userId ?? undefined,
        userName: log.user?.name ?? undefined,
        status: log.status,
        confidence: log.confidence ?? undefined,
        livenessScore: log.livenessScore ?? undefined,
        saturationMean: log.saturationMean ?? undefined,
        processingMs: log.processingMs ?? undefined,
        fraudFrameExists: log.fraudFrameExists,
        createdAt: log.createdAt,
        // fraudFramePath intencionalmente omitido — nunca expor o path
      })),
      total,
      page,
      limit
    );
  }

  /**
   * Resolve o stream do fraud frame após validar tenant + existência.
   * A validação de role acontece na rota (requireRole admin/manager).
   */
  async getFraudFrameStream(
    tenantId: string,
    recognitionLogId: string
  ): Promise<fs.ReadStream> {
    const log = await this.prisma.recognitionLog.findFirst({
      where: { id: recognitionLogId },
      select: { tenantId: true, fraudFramePath: true, fraudFrameExists: true },
    });

    if (!log) throw new NotFoundError("Recognition log not found");

    // Divergência de tenant → 403 (nunca revelar existência entre tenants)
    if (log.tenantId !== tenantId) {
      throw new ForbiddenError("Access denied to this fraud frame");
    }

    if (!log.fraudFrameExists || !log.fraudFramePath) {
      throw new NotFoundError("Fraud frame no longer available (expired or never saved)");
    }

    if (!fs.existsSync(log.fraudFramePath)) {
      // Arquivo removido fora do job — corrige o estado no banco
      await this.prisma.recognitionLog.updateMany({
        where: { id: recognitionLogId, tenantId },
        data: { fraudFrameExists: false, fraudFramePath: null },
      });
      throw new NotFoundError("Fraud frame no longer available (expired or never saved)");
    }

    return fs.createReadStream(log.fraudFramePath);
  }
}

export const auditService = new AuditService();
