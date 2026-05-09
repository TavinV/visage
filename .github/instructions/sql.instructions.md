---
description: "Use quando criar migrations Prisma, arquivos SQL, alterar schema do banco ou criar novas tabelas no projeto VisageX. Cobre convenções de schema multi-tenant, migrations incrementais e padrões de índice."
applyTo: ["db/**", "backend/prisma/**"]
---

# Banco de dados — PostgreSQL 16 + Prisma

## Convenções de schema

Toda tabela nova deve ter obrigatoriamente:

```sql
tenant_id  INT NOT NULL REFERENCES tenants(id),
created_at TIMESTAMPTZ DEFAULT NOW()
```

Tabelas com dados mutáveis também incluem `updated_at TIMESTAMPTZ DEFAULT NOW()`.

## Migrations Prisma

- Nunca editar `schema.prisma` e aplicar direto em produção sem migration
- Criar migration com: `npx prisma migrate dev --name descricao_da_mudanca`
- Nome da migration: snake_case, descritivo (`add_key_version_to_embeddings`)
- Migrations são incrementais e nunca destrutivas — nunca dropar coluna em produção sem deprecação

## Migrations SQL (db/)

Arquivos em `db/` são numerados sequencialmente:

```
db/
  init.sql          — schema inicial
  002_add_tenant_keys.sql
  003_add_key_version.sql
```

Cada arquivo tem seção `-- UP` e `-- DOWN`:

```sql
-- UP
ALTER TABLE facial_embeddings ADD COLUMN key_version INT NOT NULL DEFAULT 1;

-- DOWN
ALTER TABLE facial_embeddings DROP COLUMN key_version;
```

## Isolamento multi-tenant

- Nenhuma query pode retornar dados de múltiplos tenants sem filtro explícito
- Índices compostos sempre começam com `tenant_id`:

```sql
CREATE INDEX ON attendance_records (tenant_id, class_session_id);
CREATE INDEX ON facial_embeddings (tenant_id, user_id);
```

## Prisma schema — padrões

```prisma
model ClassSession {
  id         BigInt    @id @default(autoincrement())
  tenantId   Int
  classId    Int
  status     String    @default("open")
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  tenant     Tenant    @relation(fields: [tenantId], references: [id])
  class      Class     @relation(fields: [classId], references: [id])

  @@index([tenantId, classId])
  @@map("class_sessions")
}
```

- Usar `@@map` para manter nomes snake_case no banco
- Campos `tenantId` sempre sem `?` — obrigatório
- Relações sempre explícitas com `@relation`

## Campos sensíveis

- Nunca armazenar embedding em plaintext — sempre `embedding_ct BYTEA` cifrado
- `dek_ct`, `dek_iv`, `dek_tag` em `tenant_keys` — nunca plaintext DEK
- Senhas: `password_hash` com bcrypt (12 rounds), nunca plaintext
