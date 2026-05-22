---
description: "Use quando criar ou editar rotas Express, middlewares, serviços, schemas Prisma ou qualquer código do backend VisageX. Cobre autenticação JWT, isolamento multi-tenant, Prisma ORM, tratamento de erros e padrões de serviço."
applyTo: "backend/**"
---

# Backend — Express 4 + Prisma ORM + TypeScript

## Estrutura de pastas

```
backend/src/
  routes/        — Express Router por domínio (auth, attendance, users, devices…)
  middleware/    — authenticate.ts, requireRole.ts, validate.ts
  services/      — classes OOP; base.service.ts + um arquivo por domínio
  lib/           — prisma.ts (cliente singleton), redis.ts, logger.ts
  types/         — interfaces e tipos compartilhados
```

## Padrão de serviço — OOP com BaseService

**Todo serviço é uma classe** que estende `BaseService` (`services/base.service.ts`).  
O arquivo exporta uma **instância singleton** — nunca instancie nas rotas.

```typescript
// services/meu-dominio.service.ts
import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError } from "../utils/errors";
import type { MinhaModel } from "@prisma/client";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateMeuDominioInput {
  nome: string;
  tenantId: number;
}
export interface MeuDominioOutput {
  id: number;
  nome: string;
  createdAt: Date;
}
export interface ListMeuDominioParams extends ListParams {
  tenantId: number; // obrigatório para serviços tenant-scoped
  status?: string; // filtro opcional extra
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class MeuDominioService extends BaseService {
  /** Campos aceitos em sortBy (allowlist de segurança). */
  private static readonly SORT_FIELDS = ["nome", "createdAt"] as const;

  async list(
    params: ListMeuDominioParams,
  ): Promise<PaginatedResult<MeuDominioOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy = this.buildOrderBy(
      params.sortBy,
      params.sortOrder,
      MeuDominioService.SORT_FIELDS,
    ) ?? { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["nome"]);

    const where = {
      tenantId: params.tenantId, // ← isolamento tenant SEMPRE presente
      ...(params.status && { status: params.status }),
      ...(searchOr && { OR: searchOr }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.meuDominio.findMany({ where, take, skip, orderBy }),
      this.prisma.meuDominio.count({ where }),
    ]);

    return this.buildPaginatedResult(
      rows.map(this.toOutput),
      total,
      page,
      limit,
    );
  }

  async findById(id: number, tenantId: number): Promise<MeuDominioOutput> {
    const row = await this.prisma.meuDominio.findFirst({
      where: { id, tenantId }, // ← validar tenant
    });
    if (!row) throw new NotFoundError("meu_dominio_not_found");
    return this.toOutput(row);
  }

  async create(input: CreateMeuDominioInput): Promise<MeuDominioOutput> {
    const row = await this.prisma.meuDominio.create({ data: input });
    this.logger.info(
      { id: row.id, tenantId: input.tenantId },
      "MeuDominio created",
    );
    return this.toOutput(row);
  }

  private toOutput(row: MinhaModel): MeuDominioOutput {
    return { id: row.id, nome: row.nome, createdAt: row.createdAt };
  }
}

export const meuDominioService = new MeuDominioService();
```

### Primitivos disponíveis no BaseService

| Método                                             | Uso                                                      |
| -------------------------------------------------- | -------------------------------------------------------- |
| `buildPagination(params)`                          | Normaliza `page`/`limit` → `{ take, skip, page, limit }` |
| `buildPaginatedResult(data, total, page, limit)`   | Monta envelope `{ data, pagination }`                    |
| `buildOrderBy(sortBy, sortOrder, allowedFields[])` | Cláusula `orderBy` com allowlist                         |
| `buildSearchFilter(search, fields[])`              | Array de cláusulas `OR` ILIKE para o Prisma              |
| `buildDateRange(field, from?, to?)`                | Filtro de intervalo de datas                             |
| `this.prisma`                                      | Cliente Prisma singleton                                 |
| `this.logger`                                      | Logger Pino estruturado                                  |

### Tipos exportados do BaseService

```typescript
import type {
  PaginationParams,
  SortParams,
  SearchParams,
  ListParams,
  PaginatedResult,
} from "./base.service";

// ListParams = PaginationParams & SortParams & SearchParams
// PaginatedResult<T> = { data: T[], pagination: { total, page, limit, totalPages } }
```

## Estrutura de rota

A rota importa o singleton do serviço e repassa os params do request:

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { meuDominioService } from "../services/meu-dominio.service";
import { z } from "zod";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  nome: z.string().min(2).max(200),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

/** GET /meu-dominio  — lista paginada */
router.get(
  "/",
  authenticate,
  requireRole(["admin", "manager"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const result = await meuDominioService.list({
        tenantId,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        search: req.query.search as string | undefined,
      });
      res.json(result); // já retorna { data, pagination }
    } catch (err) {
      next(err);
    }
  },
);

/** GET /meu-dominio/:id */
router.get(
  "/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const row = await meuDominioService.findById(
        Number(req.params.id),
        tenantId,
      );
      res.json({ data: row });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /meu-dominio */
router.post(
  "/",
  authenticate,
  requireRole(["admin"]),
  validate(CreateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const row = await meuDominioService.create({ ...req.body, tenantId });
      res.status(201).json({ data: row });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
```

## Isolamento multi-tenant — regra #1

Todo handler extrai `tenantId` do JWT e **sempre** passa para o serviço:

```typescript
const { tenantId, userId, role } = req.tenant!;

// No serviço, toda query inclui tenantId
const row = await this.prisma.classSession.findFirst({
  where: { id: sessionId, tenantId }, // ← nunca omitir
});
if (!row) throw new NotFoundError("session_not_found");
```

Nunca confiar em `id` vindo do body/params sem validar que pertence ao tenant.

## Erros HTTP

Sempre retornar `{ error: string, code: string }`:

```typescript
// Lançar no service — classes disponíveis em utils/errors.ts
throw new NotFoundError("session_not_found");
throw new ConflictError("nome_duplicado");
throw new ValidationError("campo_invalido");
throw new UnauthorizedError("token_invalido");
throw new ForbiddenError("sem_permissao");
// O handler global em app.ts formata automaticamente.
```

## Prisma — padrões

```typescript
// O BaseService já expõe this.prisma — não importar diretamente no serviço
// Em rotas/middleware, importar de lib/prisma.ts se necessário

// Transações para operações atômicas
await this.prisma.$transaction([
  this.prisma.attendance.updateMany({
    where: { sessionId, tenantId },
    data: { status: "absent" },
  }),
  this.prisma.classSession.update({
    where: { id: sessionId },
    data: { status: "closed" },
  }),
]);

// Nunca expor campos sensíveis — usar select explícito
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, name: true, email: true, role: true }, // sem passwordHash
});
```

## Redis

```typescript
import { redis } from "../lib/redis";

await redis.set(
  `prepresenca:${tenantId}:${locationId}:${userId}`,
  timestamp,
  "EX",
  ttlSeconds,
  "NX",
);
```

## Logging

```typescript
// O BaseService já expõe this.logger — usar dentro dos serviços
this.logger.info({ tenantId, id: row.id }, "Resource created");
this.logger.error({ err, tenantId, code: "prisma_error" }, "Query failed");
// Nunca usar console.log em produção
```

## Validação de entrada

Usar `zod` para todo body/params/query. O middleware `validate(schema)` aplica `schema.parse(req.body)` e chama `next(err)` se falhar.
