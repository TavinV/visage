/**
 * DevicesService
 * Gerencia dispositivos por tenant.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";
import crypto from "crypto";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateDeviceInput {
  tenantId: string;
  deviceFingerprint: string;
  label?: string;
  locationId?: string;
}

export interface UpdateDeviceInput {
  label?: string;
  locationId?: string;
  isActive?: boolean;
}

export interface DeviceOutput {
  id: string;
  tenantId: string;
  deviceFingerprint: string;
  label?: string;
  locationId?: string;
  isActive: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
}

export interface ListDevicesParams extends ListParams {
  tenantId: string;
  isActive?: boolean;
  locationId?: string;
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
      ...(searchOr && { OR: searchOr }),
    };

    const [devices, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({ where, take, skip, orderBy }),
      this.prisma.device.count({ where }),
    ]);

    return this.buildPaginatedResult(
      devices.map(this.toOutput),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém um dispositivo pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<DeviceOutput> {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
    });
    if (!device) throw new NotFoundError("Device not found");
    return this.toOutput(device);
  }

  /**
   * Cria um novo dispositivo.
   */
  async create(input: CreateDeviceInput): Promise<DeviceOutput> {
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
      },
    });

    this.logger.info({ deviceId: device.id, tenantId: input.tenantId }, "Device created");
    return this.toOutput(device);
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
      },
    });

    this.logger.info({ deviceId: id, tenantId }, "Device updated");
    return this.toOutput(updated);
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
    this.logger.info({ deviceId: id, tenantId }, "Device deleted");
  }

  private toOutput(device: any): DeviceOutput {
    return {
      id: device.id,
      tenantId: device.tenantId,
      deviceFingerprint: device.deviceFingerprint,
      label: device.label ?? undefined,
      locationId: device.locationId ?? undefined,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt ?? undefined,
      createdAt: device.createdAt,
    };
  }
}

export const devicesService = new DevicesService();
