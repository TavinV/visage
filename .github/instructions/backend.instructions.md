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
  services/      — lógica de negócio, chamam Prisma e outros serviços
  lib/           — prisma.ts (cliente singleton), redis.ts, logger.ts
  types/         — interfaces e tipos compartilhados
```

## Isolamento multi-tenant — regra #1

Todo handler extrai `tenantId` do JWT e aplica em **todas** as queries Prisma:

```typescript
// middleware/authenticate.ts já popula req.tenant
const { tenantId, userId, role } = req.tenant;

// Query SEMPRE com tenantId
const session = await prisma.classSession.findFirst({
  where: { id: sessionId, tenantId }, // ← nunca omitir
});
if (!session) throw new NotFoundError("session_not_found");
```

Nunca confiar em `id` vindo do body/params sem validar que pertence ao tenant.

## Estrutura de rota

```typescript
import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const CreateSessionSchema = z.object({
  classId: z.number().int().positive(),
  classesWorth: z.number().int().min(1).max(4).default(1),
});

router.post(
  "/",
  authenticate,
  requireRole(["teacher", "manager", "admin"]),
  validate(CreateSessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.tenant;
      const { classId, classesWorth } = req.body;
      // ... lógica no service
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);
```

## Erros HTTP

Sempre retornar `{ error: string, code: string }`:

```typescript
// Lançar no service ou handler
throw Object.assign(new Error("Sessão não encontrada"), {
  status: 404,
  code: "session_not_found",
});

// Handler global de erro (já existente em app.ts)
// captura status + code e formata a resposta
```

## Prisma — padrões

```typescript
// Cliente singleton em lib/prisma.ts — importar, nunca instanciar direto
import { prisma } from "../lib/prisma";

// Transações para operações atômicas
await prisma.$transaction([
  prisma.attendance.updateMany({
    where: { sessionId, tenantId },
    data: { status: "absent" },
  }),
  prisma.classSession.update({
    where: { id: sessionId },
    data: { status: "closed", endedAt: new Date() },
  }),
]);

// Nunca expor campos sensíveis — usar select explícito
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, name: true, email: true, role: true }, // sem passwordHash
});
```

## Redis

```typescript
import { redis } from "../lib/redis";

// SET NX com TTL para pré-presença
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
import { logger } from "../lib/logger";
// Nunca usar console.log em produção
logger.info({ tenantId, sessionId, action: "session_opened" });
logger.error({ err, tenantId, code: "prisma_error" });
```

## Validação de entrada

Usar `zod` para todo body/params/query. O middleware `validate(schema)` aplica `schema.parse(req.body)` e chama `next(err)` se falhar.
