/**
 * LocationsService
 * Gerencia localizações/ambientes por tenant.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";
import { auditService } from "./audit.service";
import { snapshot } from "../utils/diff";

/** Campos do local acompanhados pela trilha de auditoria. */
const LOCATION_FIELDS = ["name", "address", "isActive"] as const;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateLocationInput {
  tenantId: string;
  name: string;
  address?: string;
}

export interface UpdateLocationInput {
  name?: string;
  address?: string;
  isActive?: boolean;
}

export interface LocationOutput {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ListLocationsParams extends ListParams {
  tenantId: string;
  isActive?: boolean;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class LocationsService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "isActive"] as const;

  /**
   * Lista localizações de um tenant.
   */
  async list(params: ListLocationsParams): Promise<PaginatedResult<LocationOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, LocationsService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name", "address"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      ...(searchOr && { OR: searchOr }),
    };

    const [locations, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({ where, take, skip, orderBy }),
      this.prisma.location.count({ where }),
    ]);

    return this.buildPaginatedResult(
      locations.map(this.toOutput),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém uma localização pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<LocationOutput> {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!location) throw new NotFoundError("Location not found");
    return this.toOutput(location);
  }

  /**
   * Cria uma nova localização.
   */
  async create(input: CreateLocationInput): Promise<LocationOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const location = await this.prisma.location.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        address: input.address,
        isActive: true,
      },
    });

    auditService.record({
      action: "location.created",
      tenantId: input.tenantId,
      targetId: location.id,
      targetLabel: location.name,
      afterState: snapshot(location, LOCATION_FIELDS),
    });

    this.logger.info({ locationId: location.id, tenantId: input.tenantId }, "Location created");
    return this.toOutput(location);
  }

  /**
   * Atualiza uma localização.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateLocationInput
  ): Promise<LocationOutput> {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!location) throw new NotFoundError("Location not found");

    const updated = await this.prisma.location.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    auditService.recordChange({
      action: "location.updated",
      tenantId,
      targetId: id,
      targetLabel: updated.name,
      before: location,
      after: updated,
      fields: LOCATION_FIELDS,
    });

    this.logger.info({ locationId: id, tenantId }, "Location updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta uma localização.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!location) throw new NotFoundError("Location not found");

    await this.prisma.location.delete({ where: { id } });

    auditService.record({
      action: "location.deleted",
      tenantId,
      targetId: id,
      targetLabel: location.name,
      beforeState: snapshot(location, LOCATION_FIELDS),
    });

    this.logger.info({ locationId: id, tenantId }, "Location deleted");
  }

  private toOutput(location: any): LocationOutput {
    return {
      id: location.id,
      tenantId: location.tenantId,
      name: location.name,
      address: location.address ?? undefined,
      isActive: location.isActive,
      createdAt: location.createdAt,
    };
  }
}

export const locationsService = new LocationsService();
