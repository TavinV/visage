/**
 * DevicesService
 * Gerencia dispositivos por tenant.
 *
 * Calibração é POR TOTEM: câmera, iluminação e ângulo variam de sala para
 * sala, e um threshold bom no corredor pode ser inutilizável no laboratório.
 * Os campos de threshold no Device são overrides — NULL herda do tenant.
 * Uma calibração boa pode ser copiada para outros totens equivalentes.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";
import crypto from "crypto";

// ── DTOs ─────────────────────────────────────────────────────────────────────

/** Faixas operáveis — espelham o clamp do hot path do reconhecimento. */
const RECOGNITION_RANGE = { min: 0.3, max: 2.0 };
const LIVENESS_RANGE = { min: 0.5, max: 0.95 };

/**
 * Campos do totem acompanhados pela trilha. apiKeyHash fica de fora de
 * propósito: a regeneração da chave tem evento próprio, e o hash nunca deve
 * aparecer nem redigido no diff de uma edição comum.
 */
const AUDITED_DEVICE_FIELDS = [
  "label",
  "locationId",
  "isActive",
  "allowEnrollment",
  "deviceFingerprint",
] as const;

/** Thresholds — o que muda o rigor do reconhecimento é sempre auditado. */
const AUDITED_CALIBRATION_FIELDS = [
  "recognitionThreshold",
  "livenessThreshold",
  "livenessEnabled",
] as const;

export interface DeviceCalibrationInput {
  /** null limpa o override e volta a herdar do tenant. */
  recognitionThreshold?: number | null;
  livenessThreshold?: number | null;
  livenessEnabled?: boolean | null;
}

export interface DeviceCalibrationOutput {
  /** Override do totem — null significa "herda do tenant". */
  recognitionThreshold: number | null;
  livenessThreshold: number | null;
  livenessEnabled: boolean | null;
  /** Valores realmente usados no reconhecimento (override ?? tenant). */
  effectiveRecognitionThreshold: number;
  effectiveLivenessThreshold: number;
  effectiveLivenessEnabled: boolean;
  /** true quando ao menos um threshold é próprio do totem. */
  isCalibrated: boolean;
  calibratedAt?: Date;
  /** Totem de origem, quando a calibração veio copiada. */
  calibrationSourceId?: string;
  calibrationSourceLabel?: string;
}

export interface CreateDeviceInput {
  tenantId: string;
  deviceFingerprint: string;
  label?: string;
  locationId?: string;
  allowEnrollment?: boolean;
}

export interface UpdateDeviceInput {
  label?: string;
  locationId?: string;
  isActive?: boolean;
  allowEnrollment?: boolean;
}

export interface DeviceOutput {
  id: string;
  tenantId: string;
  deviceFingerprint: string;
  label?: string;
  locationId?: string;
  isActive: boolean;
  allowEnrollment: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
  /** Presente quando o chamador pediu os dados de calibração. */
  calibration?: DeviceCalibrationOutput;
}

export interface ListDevicesParams extends ListParams {
  tenantId: string;
  isActive?: boolean;
  locationId?: string;
  allowEnrollment?: boolean;
  lastSeenFrom?: Date;
  lastSeenTo?: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class DevicesService extends BaseService {
  private static readonly SORT_FIELDS = [
    "label",
    "createdAt",
    "lastSeenAt",
    "isActive",
  ] as const;

  /**
   * Lista dispositivos de um tenant.
   */
  async list(params: ListDevicesParams): Promise<PaginatedResult<DeviceOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, DevicesService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["label", "deviceFingerprint"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...(params.locationId && { locationId: params.locationId }),
      ...(params.allowEnrollment !== undefined && {
        allowEnrollment: params.allowEnrollment,
      }),
      ...this.buildDateRange("lastSeenAt", params.lastSeenFrom, params.lastSeenTo),
      ...(searchOr && { OR: searchOr }),
    };

    const [devices, total, defaults] = await this.prisma.$transaction([
      this.prisma.device.findMany({ where, take, skip, orderBy }),
      this.prisma.device.count({ where }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId: params.tenantId } }),
    ]);

    // Rótulo do totem de origem resolvido em lote — a lista mostra "copiado
    // de X" sem um fetch por linha
    const sourceIds = [
      ...new Set(devices.map((d) => d.calibrationSourceId).filter((id): id is string => !!id)),
    ];
    const sources = sourceIds.length
      ? await this.prisma.device.findMany({
          where: { id: { in: sourceIds }, tenantId: params.tenantId },
          select: { id: true, label: true },
        })
      : [];
    const sourceLabels = new Map(sources.map((s) => [s.id, s.label ?? undefined]));

    return this.buildPaginatedResult(
      devices.map((d) => this.toOutput(d, defaults, sourceLabels.get(d.calibrationSourceId ?? ""))),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém um dispositivo pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<DeviceOutput> {
    const [device, defaults] = await Promise.all([
      this.prisma.device.findFirst({ where: { id, tenantId } }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
    ]);
    if (!device) throw new NotFoundError("Device not found");

    const source = device.calibrationSourceId
      ? await this.prisma.device.findFirst({
          where: { id: device.calibrationSourceId, tenantId },
          select: { label: true },
        })
      : null;

    return this.toOutput(device, defaults, source?.label ?? undefined);
  }

  // ── Calibração por totem ────────────────────────────────────────────────────

  /**
   * Grava os thresholds próprios do totem. null em um campo limpa aquele
   * override específico, voltando a herdar o valor do tenant.
   */
  async applyCalibration(
    id: string,
    tenantId: string,
    input: DeviceCalibrationInput
  ): Promise<DeviceOutput> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        label: true,
        deviceFingerprint: true,
        recognitionThreshold: true,
        livenessThreshold: true,
        livenessEnabled: true,
      },
    });
    if (!device) throw new NotFoundError("Device not found");

    if (input.recognitionThreshold != null) {
      this.assertRange(
        input.recognitionThreshold,
        RECOGNITION_RANGE,
        "O limiar de reconhecimento"
      );
    }
    if (input.livenessThreshold != null) {
      this.assertRange(input.livenessThreshold, LIVENESS_RANGE, "O limiar de vivacidade");
    }

    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        ...(input.recognitionThreshold !== undefined && {
          recognitionThreshold: input.recognitionThreshold,
        }),
        ...(input.livenessThreshold !== undefined && {
          livenessThreshold: input.livenessThreshold,
        }),
        ...(input.livenessEnabled !== undefined && { livenessEnabled: input.livenessEnabled }),
        calibratedAt: new Date(),
        // Valor ajustado à mão deixa de ser cópia de outro totem
        calibrationSourceId: null,
      },
    });

    // Afrouxar um threshold é a forma mais silenciosa de degradar o
    // antifraude — a trilha guarda o valor exato de antes e o de depois.
    auditService.recordChange({
      action: "device.calibrated",
      tenantId,
      targetId: id,
      targetLabel: device.label ?? device.deviceFingerprint,
      before: device,
      after: updated,
      fields: AUDITED_CALIBRATION_FIELDS,
      details: `Calibração do totem "${device.label ?? device.deviceFingerprint}" ajustada`,
    });

    this.logger.info({ deviceId: id, tenantId, ...input }, "Device calibration applied");
    return this.findById(id, tenantId);
  }

  /**
   * Remove a calibração do totem — volta a usar os valores do tenant.
   */
  async resetCalibration(id: string, tenantId: string): Promise<DeviceOutput> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        label: true,
        deviceFingerprint: true,
        recognitionThreshold: true,
        livenessThreshold: true,
        livenessEnabled: true,
      },
    });
    if (!device) throw new NotFoundError("Device not found");

    await this.prisma.device.update({
      where: { id },
      data: {
        recognitionThreshold: null,
        livenessThreshold: null,
        livenessEnabled: null,
        calibratedAt: null,
        calibrationSourceId: null,
      },
    });

    auditService.recordChange({
      action: "device.calibration_reset",
      tenantId,
      targetId: id,
      targetLabel: device.label ?? device.deviceFingerprint,
      before: device,
      after: { recognitionThreshold: null, livenessThreshold: null, livenessEnabled: null },
      fields: AUDITED_CALIBRATION_FIELDS,
      details: `Calibração própria do totem "${device.label ?? device.deviceFingerprint}" removida; voltou a herdar os valores da instituição`,
    });

    this.logger.info({ deviceId: id, tenantId }, "Device calibration reset to tenant defaults");
    return this.findById(id, tenantId);
  }

  /**
   * Copia a calibração de um totem para outros — totens de salas parecidas
   * não precisam repetir a coleta guiada inteira.
   *
   * Retorna quantos totens receberam a calibração.
   */
  async copyCalibration(
    sourceId: string,
    tenantId: string,
    targetIds: string[]
  ): Promise<{ copied: number; targets: DeviceOutput[] }> {
    const source = await this.prisma.device.findFirst({
      where: { id: sourceId, tenantId },
      select: {
        id: true,
        recognitionThreshold: true,
        livenessThreshold: true,
        livenessEnabled: true,
        calibratedAt: true,
      },
    });
    if (!source) throw new NotFoundError("Totem de origem não encontrado");

    if (source.calibratedAt === null) {
      throw new ValidationError(
        "O totem de origem ainda não foi calibrado — não há o que copiar",
        "SOURCE_NOT_CALIBRATED"
      );
    }

    const targets = [...new Set(targetIds)].filter((id) => id !== sourceId);
    if (targets.length === 0) {
      throw new ValidationError(
        "Escolha pelo menos um totem de destino diferente da origem",
        "NO_CALIBRATION_TARGETS"
      );
    }

    const found = await this.prisma.device.findMany({
      where: { id: { in: targets }, tenantId },
      select: { id: true },
    });
    if (found.length !== targets.length) {
      throw new NotFoundError("Um ou mais totens de destino não foram encontrados");
    }

    const result = await this.prisma.device.updateMany({
      where: { id: { in: targets }, tenantId },
      data: {
        recognitionThreshold: source.recognitionThreshold,
        livenessThreshold: source.livenessThreshold,
        livenessEnabled: source.livenessEnabled,
        calibratedAt: new Date(),
        calibrationSourceId: sourceId,
      },
    });

    const updated = await Promise.all(targets.map((id) => this.findById(id, tenantId)));

    // Um evento por totem afetado — filtrar "o que mudou neste totem" tem de
    // achar a cópia também, não só a calibração feita à mão nele
    for (const target of updated) {
      auditService.record({
        action: "device.calibration_copied",
        tenantId,
        targetId: target.id,
        targetLabel: target.label ?? target.deviceFingerprint,
        afterState: {
          recognitionThreshold: source.recognitionThreshold,
          livenessThreshold: source.livenessThreshold,
          livenessEnabled: source.livenessEnabled,
        },
        changedFields: [...AUDITED_CALIBRATION_FIELDS],
        details: `Calibração copiada de outro totem para "${target.label ?? target.deviceFingerprint}"`,
        metadata: { sourceDeviceId: sourceId },
      });
    }

    this.logger.info(
      { tenantId, sourceId, targets: targets.length },
      "Device calibration copied to other totems"
    );

    return { copied: result.count, targets: updated };
  }

  private assertRange(
    value: number,
    range: { min: number; max: number },
    label: string
  ): void {
    if (value < range.min || value > range.max) {
      throw new ValidationError(
        `${label} deve ficar entre ${range.min} e ${range.max}`,
        "THRESHOLD_OUT_OF_RANGE"
      );
    }
  }

  /**
   * Cria um novo dispositivo.
   * A apiKey bruta só existe nesta resposta — apenas o SHA-256 é persistido.
   */
  async create(input: CreateDeviceInput): Promise<DeviceOutput & { apiKey: string }> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Gerar hash da chave da API
    const apiKey = crypto.randomBytes(32).toString("hex");
    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Validar localização se fornecida
    if (input.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId: input.tenantId },
      });
      if (!location) throw new NotFoundError("Location not found in this tenant");
    }

    const device = await this.prisma.device.create({
      data: {
        tenantId: input.tenantId,
        deviceFingerprint: input.deviceFingerprint,
        label: input.label,
        locationId: input.locationId,
        apiKeyHash,
        isActive: true,
        allowEnrollment: input.allowEnrollment ?? false,
      },
    });

    auditService.record({
      action: "device.created",
      tenantId: input.tenantId,
      targetId: device.id,
      targetLabel: device.label ?? device.deviceFingerprint,
      afterState: snapshot(device, AUDITED_DEVICE_FIELDS),
      details: `Totem "${device.label ?? device.deviceFingerprint}" criado com nova chave de acesso`,
    });

    this.logger.info({ deviceId: device.id, tenantId: input.tenantId }, "Device created");
    return { ...(await this.findById(device.id, input.tenantId)), apiKey };
  }

  /**
   * Atualiza um dispositivo.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateDeviceInput
  ): Promise<DeviceOutput> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
    });
    if (!device) throw new NotFoundError("Device not found");

    // Validar localização se fornecida
    if (input.locationId !== undefined) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId },
      });
      if (!location) throw new NotFoundError("Location not found in this tenant");
    }

    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.locationId !== undefined && { locationId: input.locationId }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.allowEnrollment !== undefined && { allowEnrollment: input.allowEnrollment }),
      },
    });

    auditService.recordChange({
      action: "device.updated",
      tenantId,
      targetId: id,
      targetLabel: updated.label ?? updated.deviceFingerprint,
      before: device,
      after: updated,
      fields: AUDITED_DEVICE_FIELDS,
    });

    this.logger.info({ deviceId: id, tenantId }, "Device updated");
    return this.findById(id, tenantId);
  }

  /**
   * Regenera a chave de API do dispositivo, invalidando a anterior imediatamente.
   * A apiKey bruta só existe nesta resposta — apenas o SHA-256 é persistido.
   */
  async regenerateApiKey(id: string, tenantId: string): Promise<DeviceOutput & { apiKey: string }> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
    });
    if (!device) throw new NotFoundError("Device not found");

    const apiKey = crypto.randomBytes(32).toString("hex");
    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    await this.prisma.device.update({
      where: { id },
      data: { apiKeyHash },
    });

    // Chave antiga morre na hora: o totem que a usava para de reconhecer até
    // ser reconfigurado. Evento crítico — pode explicar uma parada de operação.
    auditService.record({
      action: "device.api_key_regenerated",
      tenantId,
      targetId: id,
      targetLabel: device.label ?? device.deviceFingerprint,
      details: `Chave de acesso do totem "${device.label ?? device.deviceFingerprint}" regenerada; a chave anterior deixou de funcionar`,
    });

    this.logger.info({ deviceId: id, tenantId }, "Device API key regenerated");
    return { ...(await this.findById(id, tenantId)), apiKey };
  }

  /**
   * Deleta um dispositivo.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
    });
    if (!device) throw new NotFoundError("Device not found");

    await this.prisma.device.delete({ where: { id } });

    auditService.record({
      action: "device.deleted",
      tenantId,
      targetId: id,
      targetLabel: device.label ?? device.deviceFingerprint,
      beforeState: snapshot(device, [...AUDITED_DEVICE_FIELDS, ...AUDITED_CALIBRATION_FIELDS]),
      details: `Totem "${device.label ?? device.deviceFingerprint}" excluído`,
    });

    this.logger.info({ deviceId: id, tenantId }, "Device deleted");
  }

  private toOutput(
    device: any,
    tenantDefaults?: {
      recognitionThreshold: number;
      livenessThreshold: number;
      livenessEnabled: boolean;
    } | null,
    calibrationSourceLabel?: string
  ): DeviceOutput {
    return {
      id: device.id,
      tenantId: device.tenantId,
      deviceFingerprint: device.deviceFingerprint,
      label: device.label ?? undefined,
      locationId: device.locationId ?? undefined,
      isActive: device.isActive,
      allowEnrollment: device.allowEnrollment ?? false,
      lastSeenAt: device.lastSeenAt ?? undefined,
      createdAt: device.createdAt,
      calibration: {
        recognitionThreshold: device.recognitionThreshold ?? null,
        livenessThreshold: device.livenessThreshold ?? null,
        livenessEnabled: device.livenessEnabled ?? null,
        effectiveRecognitionThreshold:
          device.recognitionThreshold ?? tenantDefaults?.recognitionThreshold ?? 1.1,
        effectiveLivenessThreshold:
          device.livenessThreshold ?? tenantDefaults?.livenessThreshold ?? 0.85,
        effectiveLivenessEnabled:
          device.livenessEnabled ?? tenantDefaults?.livenessEnabled ?? true,
        isCalibrated: device.calibratedAt != null,
        calibratedAt: device.calibratedAt ?? undefined,
        calibrationSourceId: device.calibrationSourceId ?? undefined,
        calibrationSourceLabel,
      },
    };
  }
}

export const devicesService = new DevicesService();
