---
description: "Cria uma rota Express completa com autenticação JWT, isolamento de tenant, validação zod e tipagem TypeScript"
argument-hint: "Nome e método da rota (ex: POST /attendance/sessions)"
agent: agent
tools: [read, edit, search]
---

Crie uma rota Express para o backend VisageX seguindo as instruções em [backend.instructions.md](../instructions/backend.instructions.md) e [postman.instructions.md](../instructions/postman.instructions.md).

## Requisitos

A rota deve incluir:

1. Arquivo em `backend/src/routes/` com Router separado por domínio
2. Middleware `authenticate` + `requireRole` com os roles corretos para o endpoint
3. Validação `zod` do body/params com schema explícito
4. Lógica de negócio isolada em `backend/src/services/`
5. Todas as queries Prisma com `where: { tenantId }` obrigatório
6. Tratamento de erro com `{ error: string, code: string }`
7. Tipos TypeScript explícitos — sem `any`
8. **Arquivo(s) `.request.yaml`** na pasta correta de `postman/postman/collections/VisageX API/` para cada endpoint criado, seguindo as regras de `postman.instructions.md` (auth herdado, `pm.collectionVariables` exclusivo, `created<Domínio>Id` para POSTs)

## Rota solicitada

$input

Consulte `context/claude.md` para entender o domínio e os modelos envolvidos antes de implementar.
