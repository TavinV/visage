# VisageX — Instruções Globais

Projeto de chamada escolar com reconhecimento facial (SaaS multi-tenant).
Fonte de verdade de arquitetura: `context/claude.md`.

## Stack por serviço

| Serviço        | Stack                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| `backend/`     | Node.js 20 LTS · Express 4 · TypeScript · Prisma ORM · PostgreSQL 16 · Redis 7     |
| `frontend/`    | Next.js 14 (App Router) · TypeScript · Tailwind CSS · ShadCN/UI · Canvas API · SSE |
| `face_engine/` | Python 3.11 · FastAPI · Uvicorn · InsightFace · MiniFASNet · ONNX                  |
| `db/`          | PostgreSQL 16 · migrações SQL incrementais                                         |

## Segurança — regras invioláveis

- Todo endpoint do backend extrai `tenant_id` do JWT e aplica em **toda** query Prisma como `where: { tenantId }`.
- DEK (Data Encryption Key) nunca trafega em plaintext. Sempre cifrada com `MASTER_KEY` antes de sair do banco.
- IV AES-GCM gerado com `crypto.randomBytes(12)` (Node) ou `os.urandom(12)` (Python) por operação — nunca reutilizar.
- `InvalidTag` na decifragem GCM jamais pode ser capturado silenciosamente.
- Senhas e segredos apenas em variáveis de ambiente — nunca hardcoded.

## Convenções gerais

- TypeScript com `strict: true` em todo código TS.
- Erros HTTP retornam sempre `{ error: string, code: string }`.
- Logs estruturados (JSON) — nunca `console.log` em produção.
- Toda tabela nova no banco inclui `tenant_id` e `created_at`.

## Modos de operação por tenant

Cada tenant possui flags independentes em `tenant_settings`:

- `pre_attendance_enabled` — pré-presença antes da chamada abrir
- `individual_checkout_enabled` — saída antecipada individual

Esses modos são **independentes** do `institution_type` (school/university).

## Como reportar mudanças estruturais

**Automático:** O agente VisageX Dev detecta automaticamente quando você edita `context/claude.md` com mudança estrutural e chama o script `.github/scripts/auto-changelog.js` para:

- Analisar `git diff` em `context/claude.md`
- Detectar padrões de mudança (schema, fluxos, modos, endpoints, segurança)
- Gerar e adicionar entrada automática ao `CHANGELOG.md` com impactos por serviço
- Você valida e faz commit

**Manual:** Use o prompt `/report-structural-change` para reportar mudança com descrição customizada.

Resultado: entrada em `CHANGELOG.md` com data, status "Em progresso" e impactos listados.

O CHANGELOG é consultado automaticamente antes de qualquer implementação — se houver divergência com `context/claude.md`, o CHANGELOG prevalece.
