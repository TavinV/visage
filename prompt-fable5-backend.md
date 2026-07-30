# Prompt para Fable 5 — Completar Backend do Visage

Copie e cole o conteúdo abaixo para o Fable 5.

---

## Contexto

Você vai trabalhar no backend do **Visage**, um SaaS multi-tenant de chamada escolar por reconhecimento facial (Node.js 20 + Express 4 + TypeScript strict + Prisma + PostgreSQL 16 + Redis 7). Existe também uma engine Python/FastAPI de reconhecimento facial (`face_engine/`), que **nunca acessa o banco de dados** — apenas recebe embeddings criptografados via HTTP e retorna resultados.

O projeto já tem uma fundação backend funcionando: autenticação JWT, middleware de tenant, CRUD de tenants/planos/usuários/dispositivos/localizações/períodos acadêmicos/cursos/turmas/matrículas/sessões de chamada. **Sua tarefa é implementar tudo que falta para fechar o fluxo de ponta a ponta de chamada escolar com reconhecimento facial**, seguindo rigorosamente os padrões já estabelecidos no código existente.

Leia estes arquivos do repositório antes de começar, na ordem:

1. `.claude/claude.md` — visão geral do produto
2. `.claude/architecture.md` — arquitetura, fluxo de dados, decisões críticas
3. `.claude/database.md` — schema completo, índices
4. `.claude/security.md` — envelope encryption (DEK/KEK), LGPD
5. `.claude/facial-recognition.md` — contratos da engine Python (`/recognize`, `/embeddings/register`, `/cache/warm`, etc.)
6. `.claude/anti-spoofing.md` — 3 camadas anti-spoofing e thresholds
7. `.claude/api.md` — endpoints REST completos por domínio
8. `.claude/development.md` — padrões de código por serviço (estrutura de pastas, padrão de serviço OOP, isolamento multi-tenant)
9. `ROADMAP.md` — checklist detalhado do que já está pronto (✅) e do que falta (❌) — **use isso como fonte de verdade sobre o que implementar**

---

## Padrões obrigatórios (não negociáveis)

- **Isolamento multi-tenant:** toda query Prisma inclui `where: { tenantId }`. Sem exceção. `req.tenant.tenantId` é injetado pelo middleware `authenticate` (`backend/src/middleware/authenticate.ts`) a partir do JWT.
- **Padrão de serviço:** toda lógica de negócio é uma classe que estende `BaseService` (`backend/src/services/base.service.ts`) e exporta uma instância singleton. Veja qualquer serviço existente (ex: `classes.service.ts`, `class-sessions.service.ts`) como modelo.
- **Rotas:** Express Router por domínio em `backend/src/routes/`, usando `requireRole(...)` de `middleware/authenticate.ts` para autorização.
- **TypeScript strict:** sem `any` implícito, sem `!` desnecessário.
- **Logs:** Pino estruturado (`lib/logger.ts`) — nunca `console.log`.
- **Erros:** sempre `{ error: string, code: string }` via `utils/errors.ts`.
- **Criptografia:** AES-256-GCM via `utils/crypto.ts`. IV único por operação (`crypto.randomBytes(12)`). `InvalidTag` do GCM **nunca** deve ser silenciado — sempre relançar.
- **Validação:** Zod em todas as rotas via middleware `validate.ts`.

---

## O que implementar (nesta ordem de prioridade)

### 1. Middleware de API Key para dispositivos (totens)

Novo middleware `middleware/deviceAuth.ts`: extrai `X-Device-Key` do header, busca hash em `devices` (campo já existe: `api_key_hash`), valida `is_active`, injeta `req.tenant = { tenantId, deviceId }` no mesmo formato usado pelo JWT. Retornar 401 se inválido/inativo. Aplicar rate limit específico (`/device/recognize`: 100 req/min por device; `/device/heartbeat`: 10 req/min por device).

### 2. Fluxo de cadastro biométrico via QR Code (Enrollment)

Criar `services/enrollment.service.ts` e `routes/enrollment.ts`:

- `POST /students/:id/enrollment-token` — gera token aleatório (não persistido em plaintext), salva `SHA-256(token)` em `enrollment_tokens` com `status='pending'`, `expires_at` = agora + `enrollment_token_expiry_hours` (default 72h, de `tenant_settings`). Retorna o token bruto (só existe nesse momento).
- `GET /students/:id/enrollment-token` — status do token atual.
- `DELETE /students/:id/enrollment-token` — revoga (`status='revoked'`).
- `POST /enrollment/validate-token` — totem envia token escaneado; valida hash + `status='pending'` + não expirado; **invalidação atômica**: `UPDATE enrollment_tokens SET status='used', used_at=NOW() WHERE token_hash=$1 AND status='pending'` (usar `updateMany` com `where` incluindo o status para evitar race condition — se `count === 0`, token já foi usado ou inválido). Cria sessão de cadastro no Redis (TTL 10min) guardando `{ tenantId, userId, step, frames: [] }`.
- `POST /enrollment/consent` — registra aceite do regulamento LGPD em `biometric_consents` (`consent_text_version`, `consented_at`, `device_fingerprint`, `ip_address`, `is_active=true`). Atualiza `users.facial_status = 'consent_given'`.
- `POST /enrollment/refuse` — registra recusa (não cria embedding), atualiza `facial_status` permanece `none` ou marca recusa conforme sessão.
- `POST /enrollment/frame` — recebe frame JPEG da sessão de cadastro ativa (Redis). Repassa para a engine Python `POST /enroll/frame` (ver seção Engine abaixo — **esse endpoint ainda não existe na engine, você também vai criá-lo**), acumula frames válidos na sessão Redis até atingir `enrollment_multi_frame_count` (default 3). Feedback por frame: verde (ok) / vermelho (retry).
- `POST /enrollment/finalize` — quando todos os N frames capturados, envia para engine `POST /enroll/finalize` (calcula média vetorial dos embeddings, normaliza L2, cifra com DEK do tenant). Persiste resultado em `facial_embeddings`. Atualiza `users.facial_status = 'registered'`. Expira/limpa sessão Redis.

Sessão de cadastro no Redis deve expirar sozinha em 10min (TTL) — se expirar, totem volta ao modo normal (isso é comportamento do frontend, mas o backend deve simplesmente deixar a chave expirar e o próximo request de frame/finalize falhar com erro claro tipo `ENROLLMENT_SESSION_EXPIRED`).

### 3. Warm cache + fluxo de chamada (hot path)

No `class-sessions.service.ts` existente, ao abrir sessão (`POST /class-sessions` já existe — adicionar side-effect):

- Buscar todos os candidatos matriculados na turma (`class_enrollments` join `facial_embeddings` join `tenant_keys`).
- Chamar `POST /cache/warm` na engine Python com a DEK cifrada do tenant + lista de candidatos (embeddings cifrados). Ver contrato exato em `.claude/facial-recognition.md`.
- Se `pre_attendance_enabled=true` no `tenant_settings`, consolidar pré-presenças existentes (`pre_attendances` não consolidadas dentro da janela) em `attendance_records` no momento da abertura.

Criar `services/recognition.service.ts` e rotas de dispositivo (autenticadas via `X-Device-Key`, middleware do item 1):

- `POST /device/recognize` — hot path, deve responder **< 200ms** (além do tempo de espera da engine). Fluxo:
  1. Middleware já validou API key → `tenantId`, `deviceId`.
  2. Busca sessão de chamada ativa para a sala/turma do dispositivo (via `locations`/`class_sessions`).
  3. Se não houver sessão ativa e `pre_attendance_enabled=true`: usa Redis `SET NX` para registrar pré-presença (evita duplicar), grava em `pre_attendances` com `expires_at`.
  4. Se houver sessão ativa: envia frame para engine `POST /recognize` com DEK cifrada + candidatos (usar cache já quente — mas ainda deve enviar candidatos, a engine decide se usa cache ou decripta).
  5. Persiste `recognition_logs` sempre (status, confidence, liveness_score, saturation_mean, processing_ms, fraud_frame_exists).
  6. Se `status='identified'`: `INSERT ... ON CONFLICT DO NOTHING` em `attendance_records` (status='present', recognized_at, confidence, liveness_score) — idempotente, um aluno não deve gerar duplicata na mesma sessão.
  7. Emite evento SSE (ver item 4) para o painel do professor e para o totem.
  8. Retorna ao totem: `{ status, person_name?, confidence? }` — dados mínimos, nunca embeddings.
- `GET /device/session/current` — retorna sessão ativa vinculada à `location_id` do dispositivo (ou `null`).
- `GET /device/heartbeat` — atualiza `devices.last_seen_at = NOW()`.
- `GET /device/stream` — SSE (ver item 4).

Ao fechar sessão (`PATCH /class-sessions/:id/close` já existe — adicionar side-effect):

- Para cada aluno matriculado sem `attendance_records` na sessão: criar registro `status='absent'`.
- Atualizar `student_class_summary` (incrementar `classes_attended`/`classes_absent` por `classes_worth` da sessão, não sempre +1).
- Emitir evento SSE final de "sessão encerrada".

### 4. SSE (Server-Sent Events)

Criar `services/sse.service.ts`: gerenciador de conexões por `tenantId` + `sessionId`/`deviceId` (Map em memória, aceitável para MVP single-instance). Endpoints:

- `GET /device/stream` (autenticado por device key) — eventos: reconhecimento realizado, sessão fechada.
- Endpoint equivalente para o painel do professor (autenticado por JWT) — mesmo padrão, evento por sessão de chamada: cada novo `attendance_record`, fechamento de sessão.

Usar `res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })`, manter conexão aberta, heartbeat periódico (comentário `: keep-alive`) para evitar timeout de proxy.

### 5. Relatórios de frequência

`services/reports.service.ts` + rotas em `routes/reports.ts` (ou adicionar a `attendance.ts` se preferir seguir a nomenclatura de `.claude/api.md`):

- `GET /attendance/reports/frequency?class_id&period_id` — agrega `student_class_summary` por turma, retorna lista de alunos com `attended`, `absent`, `%`.
- `GET /attendance/reports/student/:id` — histórico completo de `attendance_records` do aluno (todas as sessões, todas as turmas).
- `GET /attendance/reports/student/:id/summary` — agregado por turma: `{ class_id, name, attended, absent, % }`.

Sempre filtrado por `tenantId`.

### 6. Auditoria

`services/audit.service.ts` + `routes/audit.ts`:

- `GET /audit/recognition-logs?date&status&user_id` — lista `recognition_logs` do tenant, filtrável.
- `GET /audit/frames/:recognition_log_id` — stream do JPEG do fraud frame. **Validações obrigatórias antes de servir o arquivo:** JWT válido, `role IN ('admin','manager')`, `tenant_id` do JWT bate com `tenant_id` do log (retornar 403 em qualquer divergência). Nunca expor o path do arquivo na resposta — servir via stream (`res.sendFile` ou `fs.createReadStream`).
- `GET /admin/recognition-logs` — logs globais, apenas `super_admin`, sem filtro de tenant.
- `GET /admin/health` — proxy para `GET /health` da engine Python, apenas `super_admin`.

### 7. Job de limpeza de fraud frames (cron diário 03:00)

Criar `jobs/cleanupFraudFrames.ts` (usar `node-cron` ou equivalente já presente no projeto — checar `package.json`):

- Para cada tenant, varre `./fraud_frames/{tenant_id}/{data}/` e deleta arquivos com idade > `fraud_retention_hours` (de `tenant_settings`, default 24h).
- Atualiza `recognition_logs.fraud_frame_exists = false` e `fraud_frame_path = NULL` para os registros correspondentes.
- Registra em `audit_cleanup_logs`: `files_deleted`, `bytes_freed`, `tenants_processed`, `error_message` (se houver falha parcial, não deve interromper o job para os demais tenants).

### 8. LGPD — revogação de consentimento e exclusão de dados

- Endpoint para revogar consentimento (`biometric_consents.is_active = false`, `revoked_at`, `revoked_by_id`): ao revogar, **deve** deletar `facial_embeddings` do usuário imediatamente e marcar `users.facial_status = 'revoked'`. Nenhum reconhecimento pode usar embeddings de usuário com `facial_status='revoked'` — garantir isso no warm cache e no recognize (filtrar candidatos por `facial_status='registered'`).
- Endpoint de exclusão completa de dados do aluno (direito ao esquecimento): remove `facial_embeddings`, anonimiza ou remove registros associados conforme política do tenant — implemente de forma conservadora (soft delete de `users` + hard delete de dados biométricos) e documente a decisão em comentário curto no código.

### 9. Rotação de chaves

- Rota administrativa para rotacionar DEK de um tenant: gera nova DEK, re-cifra todos os `facial_embeddings` do tenant, incrementa `key_version` em `tenant_keys`, chama `DELETE /cache/dek/{tenant_id}` na engine para invalidar cache antigo.
- Rota de rotação de senha do super_admin (hoje só é possível deletando o registro manualmente — ver nota no `ROADMAP.md`, seção "Rotação de senha do Super Admin"). Implementar de forma seratamente controlada.

### 10. Engine Python — endpoints faltantes (`face_engine/`)

Esses dois endpoints são consumidos pelo fluxo de enrollment (item 2) e precisam existir na engine para o backend funcionar ponta a ponta:

- `POST /enroll/frame` — pipeline mais rigoroso que `/recognize`: SCRFD com `det_score ≥ 0.85` (vs 0.75 no reconhecimento normal) + liveness com `liveness_threshold_enrollment` (default 0.90, vs 0.85) + extração ArcFace. Retorna o embedding do frame (não cifrado ainda, ou cifrado individualmente — seguir o padrão de `POST /embeddings/register` já existente). Se qualquer verificação falhar, retorna erro claro para o frontend re-tentar aquele frame.
- `POST /enroll/finalize` — recebe N embeddings do fluxo de cadastro, calcula a média vetorial, normaliza L2, cifra o resultado final com AES-256-GCM (DEK do tenant) e retorna `{ embedding_iv, embedding_tag, embedding_ct, key_version, model_version }` no mesmo formato de `POST /embeddings/register`.
- `DELETE /cache/dek/{tenant_id}` — invalida a entrada do cache de DEK em memória (dict `{tenant_id: (dek_bytes, expires_at)}`) para forçar re-decifragem na próxima requisição (usado pela rotação de chaves do item 9).

Seguir os padrões já usados em `face_engine/app/api/routes/embeddings.py` e `recognize.py` (que já existem e estão marcados como implementados no roadmap — usá-los como referência de estilo).

---

## Testes que devem acompanhar a implementação

Não é obrigatório 100% de cobertura, mas os seguintes testes são **críticos de segurança** e devem ser escritos (ver `ROADMAP.md` seção 7.2):

1. **Isolamento cross-tenant na engine:** embedding cifrado com DEK do tenant A não pode ser decifrado com DEK do tenant B (deve lançar `InvalidTag`, nunca retornar "identified" incorreto).
2. **Isolamento cross-tenant no backend:** toda query sem `tenantId` explícito não deve vazar dados de outro tenant — teste pelo menos nos serviços novos (`enrollment.service.ts`, `recognition.service.ts`).
3. **Token QR Code de uso único:** duas chamadas concorrentes de `validate-token` com o mesmo token — apenas uma deve suceder (testar a invalidação atômica).
4. **JWT expirado / refresh token reutilizado:** deve retornar 401.
5. **`InvalidTag` nunca silenciado** — nem no backend (`utils/crypto.ts`) nem na engine.

---

## Entregáveis esperados

- Código completo e funcional para os itens 1–9 no backend Node.js (`backend/src/`).
- Código completo para o item 10 na engine Python (`face_engine/`).
- Migrations SQL necessárias, se algum schema precisar de ajuste (verificar `ROADMAP.md` seção 10 — parece que o schema já cobre tudo, mas confirme lendo `.claude/database.md` com atenção antes de assumir).
- Atualize o `ROADMAP.md` marcando os itens concluídos (✅) conforme for implementando — é o documento de progresso do projeto.
- Não implemente frontend, Nginx ou infraestrutura de deploy nesta tarefa — escopo é exclusivamente backend (Node + Engine Python).

Comece lendo os arquivos indicados, depois implemente na ordem de prioridade listada. Se encontrar ambiguidade entre o que está em `.claude/*.md` e o código já existente, o **código existente prevalece** (a documentação pode estar levemente desatualizada em detalhes finos, mas a arquitetura geral é confiável).
