---
description: "Cria uma migration Prisma ou SQL para o banco do VisageX com up/down, índices e convenções multi-tenant"
argument-hint: "Descrição da mudança no schema (ex: adicionar tabela de notificações)"
agent: agent
tools: [read, edit, search]
---

Crie uma migration para o banco VisageX seguindo as instruções em [sql.instructions.md](../instructions/sql.instructions.md).

## Requisitos

1. Arquivo de migration Prisma em `backend/prisma/migrations/` com nome descritivo
2. Atualização do `backend/prisma/schema.prisma` com o modelo correspondente
3. Se necessário, arquivo SQL incremental em `db/` com `-- UP` e `-- DOWN`
4. Toda tabela nova com `tenant_id INT NOT NULL` e `created_at TIMESTAMPTZ DEFAULT NOW()`
5. Índices compostos começando com `tenant_id`
6. Campos sensíveis sempre cifrados (nunca plaintext de embedding ou DEK)
7. Usar `@@map` no Prisma para manter nomes snake_case no banco

## Mudança solicitada

$input

Consulte `context/claude.md` seção "Schema do banco de dados" antes de criar a migration.
