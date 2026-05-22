/**
 * BaseService — classe abstrata que fornece primitivos reutilizáveis para todos os serviços.
 *
 * Herança:
 *   class PlansService extends BaseService { ... }
 *
 * Responsabilidades:
 *   - Acesso centralizado ao prisma e logger (singleton injetado)
 *   - Paginação padronizada (page + limit → skip/take + envelope de resposta)
 *   - Ordenação com allowlist de campos
 *   - Filtro de busca textual (OR sobre múltiplos campos)
 */

import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

// ── Paginação ────────────────────────────────────────────────────────────────

export interface PaginationParams {
  /** Página atual (1-based). Padrão: 1. */
  page?: number;
  /** Registros por página. Máximo: 100. Padrão: 20. */
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Ordenação ────────────────────────────────────────────────────────────────

export interface SortParams {
  /** Campo pelo qual ordenar. Deve estar na allowlist do serviço. */
  sortBy?: string;
  /** Direção da ordenação. Padrão: "asc". */
  sortOrder?: "asc" | "desc";
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export interface SearchParams {
  /** Texto livre para busca parcial case-insensitive. */
  search?: string;
}

export type ListParams = PaginationParams & SortParams & SearchParams;

// ── Classe base ──────────────────────────────────────────────────────────────

export abstract class BaseService {
  protected readonly prisma: PrismaClient;
  protected readonly logger: Logger;

  constructor() {
    this.prisma = prisma;
    this.logger = logger;
  }

  // ── Paginação ──────────────────────────────────────────────────────────────

  /**
   * Normaliza parâmetros de paginação e retorna valores prontos para o Prisma.
   * Limite máximo: 100 registros por página.
   */
  protected buildPagination(params: PaginationParams): {
    take: number;
    skip: number;
    page: number;
    limit: number;
  } {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;
    return { take: limit, skip, page, limit };
  }

  /**
   * Monta o envelope padronizado de resultado paginado.
   */
  protected buildPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Ordenação ──────────────────────────────────────────────────────────────

  /**
   * Monta cláusula `orderBy` do Prisma validando o campo contra a allowlist.
   * Retorna `undefined` quando sortBy não é fornecido ou não é permitido
   * (cabendo ao caller definir o fallback padrão).
   */
  protected buildOrderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" | undefined,
    allowedFields: readonly string[],
  ): Record<string, "asc" | "desc"> | undefined {
    if (!sortBy || !allowedFields.includes(sortBy)) return undefined;
    return { [sortBy]: sortOrder ?? "asc" };
  }

  // ── Filtros de busca textual ───────────────────────────────────────────────

  /**
   * Constrói um array de condições `OR` para busca textual parcial (ILIKE)
   * sobre os campos especificados.
   *
   * Retorna `undefined` quando `search` está vazio (sem filtro aplicado).
   *
   * Uso:
   *   const orConditions = this.buildSearchFilter(search, ["name", "email"]);
   *   where: { ...(orConditions && { OR: orConditions }) }
   */
  protected buildSearchFilter(
    search: string | undefined,
    fields: readonly string[],
  ): Array<Record<string, { contains: string; mode: "insensitive" }>> | undefined {
    if (!search?.trim()) return undefined;
    const trimmed = search.trim();
    return fields.map((field) => ({
      [field]: { contains: trimmed, mode: "insensitive" as const },
    }));
  }

  // ── Filtro de intervalo de datas ──────────────────────────────────────────

  /**
   * Monta filtro Prisma para intervalo de datas em um campo.
   * Qualquer extremo pode ser omitido.
   */
  protected buildDateRange(
    field: string,
    from?: Date,
    to?: Date,
  ): Record<string, { gte?: Date; lte?: Date }> | undefined {
    if (!from && !to) return undefined;
    return {
      [field]: {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      },
    };
  }
}
