# Visage — Roadmap & Checklist de Desenvolvimento

> Documento centralizado de progresso. Atualizar conforme etapas forem concluídas.
> Última atualização: 5 de julho de 2026

---

## Legenda

- ✅ Concluído
- 🚧 Em progresso
- ❌ Não iniciado
- ⚠️ Feito parcialmente — possui ressalvas documentadas

---

## 1. Infraestrutura Base

| Status | Tarefa                                                                             |
| ------ | ---------------------------------------------------------------------------------- |
| ✅     | Docker Compose com todos os serviços (postgres, redis, node-api, face-engine)      |
| ✅     | Variáveis de ambiente documentadas (`.env.example`)                                |
| ✅     | Schema PostgreSQL inicial (`20260509025903_initial_schema`)                        |
| ✅     | Migration de enrollment + QR Code (`20260509211744_enrollment_qrcode_and_consent`) |
| ✅     | Prisma ORM configurado com conexão ao banco                                        |
| ✅     | Redis configurado sem persistência em disco                                        |
| ❌     | Nginx como reverse proxy com SSL                                                   |
| ✅     | Job cron de limpeza de fraud frames (03:00 diário) — `jobs/cleanupFraudFrames.ts`  |
| ✅     | `audit_cleanup_logs` populado pelo job de limpeza                                  |

---

## 2. Backend — Fundação

| Status | Tarefa                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| ✅     | Estrutura Express 4 + TypeScript com `strict: true`                                                        |
| ✅     | Logger estruturado (pino) — sem `console.log` em produção                                                  |
| ✅     | Middleware de validação com Zod (`validate.ts`)                                                            |
| ✅     | Middleware de error handler global (`errorHandler.ts`)                                                     |
| ✅     | Middleware de rate limit (`rateLimit.ts`)                                                                  |
| ✅     | Middleware de autenticação JWT (`authenticate.ts`) — extrai `tenantId` do JWT                              |
| ✅     | `bootstrapSuperAdmin()` no boot — cria super_admin via env vars (idempotente)                              |
| ✅     | Lib de criptografia AES-256-GCM (`utils/crypto.ts`)                                                        |
| ✅     | Utilitários de erro HTTP (`utils/errors.ts`)                                                               |
| ✅     | Configuração centralizada (`lib/config.ts`)                                                                |
| ✅     | Serviço SMTP centralizado (`lib/mailer.ts` + `services/email.service.ts`) com templates Handlebars tipados |

---

## 3. Backend — Rotas Implementadas

| Status | Rota                              | Observação                                                                  |
| ------ | --------------------------------- | --------------------------------------------------------------------------- |
| ✅     | `GET /health`                     | Health check básico                                                         |
| ✅     | `POST /auth/login`                | Retorna `accessToken` (15min) + `refreshToken` (7 dias)                     |
| ✅     | `POST /auth/refresh`              | Rotação de refresh token via Redis                                          |
| ✅     | `POST /auth/logout`               | Revoga refresh token no Redis                                               |
| ✅     | `GET /plans`                      | Lista planos (super_admin)                                                  |
| ✅     | `POST /plans`                     | Cria plano (super_admin)                                                    |
| ✅     | `GET /tenants`                    | Lista tenants (super_admin)                                                 |
| ✅     | `POST /tenants`                   | Cria tenant + DEK + admin user inicial; envia senha por email (super_admin) |
| ✅     | `GET /tenants/:id`                | Obtém tenant (super_admin ou próprio tenant)                                |
| ✅     | `PATCH /tenants/:id`              | Atualiza tenant (super_admin)                                               |
| ✅     | `POST /tenants/:id/activate`      | Ativa tenant (super_admin)                                                  |
| ✅     | `POST /tenants/:id/deactivate`    | Desativa tenant (super_admin)                                               |
| ✅     | `POST /tenants/:id/cancel`        | Cancela tenant (super_admin)                                                |
| ✅     | `GET /tenant-settings`            | Obtém settings do tenant (autenticado)                                      |
| ✅     | `PATCH /tenant-settings`          | Atualiza settings (admin)                                                   |
| ✅     | `GET /locations`                  | Lista localizações (admin)                                                  |
| ✅     | `POST /locations`                 | Cria localização (admin)                                                    |
| ✅     | `GET /locations/:id`              | Obtém localização (admin)                                                   |
| ✅     | `PATCH /locations/:id`            | Atualiza localização (admin)                                                |
| ✅     | `DELETE /locations/:id`           | Deleta localização (admin)                                                  |
| ✅     | `GET /devices`                    | Lista dispositivos (admin)                                                  |
| ✅     | `POST /devices`                   | Cria dispositivo (admin)                                                    |
| ✅     | `GET /devices/:id`                | Obtém dispositivo (admin)                                                   |
| ✅     | `PATCH /devices/:id`              | Atualiza dispositivo (admin)                                                |
| ✅     | `DELETE /devices/:id`             | Deleta dispositivo (admin)                                                  |
| ✅     | `GET /academic-periods`           | Lista períodos acadêmicos (admin)                                           |
| ✅     | `POST /academic-periods`          | Cria período acadêmico (admin)                                              |
| ✅     | `GET /academic-periods/:id`       | Obtém período acadêmico (admin)                                             |
| ✅     | `PATCH /academic-periods/:id`     | Atualiza período acadêmico (admin)                                          |
| ✅     | `DELETE /academic-periods/:id`    | Deleta período acadêmico (admin)                                            |
| ✅     | `GET /courses`                    | Lista cursos (admin)                                                        |
| ✅     | `POST /courses`                   | Cria curso (admin)                                                          |
| ✅     | `GET /courses/:id`                | Obtém curso (admin)                                                         |
| ✅     | `PATCH /courses/:id`              | Atualiza curso (admin)                                                      |
| ✅     | `DELETE /courses/:id`             | Deleta curso (admin)                                                        |
| ✅     | `GET /classes`                    | Lista turmas (admin)                                                        |
| ✅     | `POST /classes`                   | Cria turma (admin)                                                          |
| ✅     | `GET /classes/:id`                | Obtém turma (admin)                                                         |
| ✅     | `PATCH /classes/:id`              | Atualiza turma (admin)                                                      |
| ✅     | `DELETE /classes/:id`             | Deleta turma (admin)                                                        |
| ✅     | `GET /class-enrollments`          | Lista matrículas (admin)                                                    |
| ✅     | `POST /class-enrollments`         | Cria matrícula (admin)                                                      |
| ✅     | `GET /class-enrollments/:c/:u`    | Obtém matrícula (admin)                                                     |
| ✅     | `DELETE /class-enrollments/:c/:u` | Deleta matrícula (admin)                                                    |
| ✅     | `GET /class-sessions`             | Lista sessões de chamada (admin)                                            |
| ✅     | `POST /class-sessions`            | Cria sessão de chamada (admin)                                              |
| ✅     | `GET /class-sessions/:id`         | Obtém sessão de chamada (admin)                                             |
| ✅     | `PATCH /class-sessions/:id`       | Atualiza sessão de chamada (admin)                                          |
| ✅     | `POST /class-sessions/:id/close`  | Fecha sessão de chamada (admin)                                             |

---

## 4. Backend — Rotas Não Implementadas

| ------ | ---------------------------------------------------------------------------------- |
| ✅ | `GET /attendance/reports/frequency` — por turma e período |
| ✅ | `GET /attendance/reports/student/:id` — histórico do aluno |
| ✅ | `GET /attendance/reports/student/:id/summary` — aulas por turma + % frequência |

### 4.8 Cadastro Biométrico via QR Code (Enrollment)

| Status | Rota                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| ✅     | `POST /students/:id/enrollment-token` — gera token (SHA-256 persistido, bruto só na resposta) |
| ✅     | `GET /students/:id/enrollment-token` — status do token atual                                  |
| ✅     | `DELETE /students/:id/enrollment-token` — revoga token pendente                               |
| ✅     | `POST /enrollment/validate-token` — consumo atômico de uso único (totem)                      |
| ✅     | `POST /enrollment/consent` — registra aceite LGPD em `biometric_consents`                     |
| ✅     | `POST /enrollment/refuse` — registra recusa (facial_status='consent_refused')                 |
| ✅     | `POST /enrollment/frame` — frame → engine `/enroll/frame` (liveness rigoroso)                 |
| ✅     | `POST /enrollment/finalize` — consolida embedding via engine `/enroll/finalize`               |

### 4.9 Auditoria

| Status | Rota                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| ✅     | `GET /audit/recognition-logs` — filtrável por data, status, usuário                  |
| ✅     | `GET /audit/frames/:recognition_log_id` — serve JPEG via stream (admin/manager only) |
| ✅     | `GET /admin/recognition-logs` — logs globais (super_admin)                           |
| ✅     | `GET /admin/health` — saúde da engine (super_admin)                                  |
| ✅     | `POST /admin/rotate-password` — rotação segura da senha do super_admin               |
| ✅     | `POST /tenants/:id/rotate-key` — rotação de DEK do tenant (super_admin)              |
| ✅     | `POST /users/:id/revoke-consent` — LGPD: revoga consentimento + deleta embeddings    |
| ✅     | `DELETE /users/:id/data` — LGPD: direito ao esquecimento                             |

### 4.10 Dispositivo — Autenticado por X-Device-Key

| Status | Rota                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| ✅     | `POST /device/recognize` — totem solicita reconhecimento (hot path)               |
| ✅     | `GET /device/session/current` — sessão ativa na sala do totem                     |
| ✅     | `GET /device/stream` — SSE: eventos em tempo real para o totem                    |
| ✅     | `GET /device/heartbeat` — atualiza `last_seen_at` do dispositivo                  |
| ✅     | `GET /class-sessions/:id/stream` — SSE: painel do professor                       |
| ✅     | `GET /class-sessions/:id/records` — registros da sessão (carga inicial do painel) |

---

## 5. Backend — Lógicas de Negócio

| Status | Funcionalidade                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Envelope encryption: DEK gerada no cadastro de tenant, salva cifrada com MASTER_KEY                                                       |
| ✅     | Admin user criado automaticamente ao criar tenant; senha gerada com `crypto.randomBytes`, enviada por email, armazenada em hash           |
| ✅     | Troca de senha autenticada (`PUT /users/:id/change-password`) — qualquer usuário pode trocar a própria senha; admin pode trocar de outros |
| ✅     | Access Token (15min) + Refresh Token com rotação e revogação via Redis                                                                    |
| ✅     | Super Admin bootstrap via env vars — modelo único e idempotente                                                                           |
| ✅     | Middleware de API Key para dispositivos (X-Device-Key → `tenant_id`, `device_id`) — `middleware/deviceAuth.ts`                            |
| ✅     | Warm cache ao abrir chamada: `POST /cache/warm` na engine com DEK cifrada + candidatos                                                    |
| ✅     | Consolidação de pré-presenças ao abrir chamada (se `pre_attendance_enabled = true`)                                                       |
| ✅     | Pré-presença: SET NX Redis ao reconhecer sem sessão ativa                                                                                 |
| ✅     | SSE: emissão de eventos para painel do professor e para o totem — `services/sse.service.ts`                                               |
| ✅     | Consolidação de ausentes ao encerrar chamada                                                                                              |
| ✅     | Atualização de `student_class_summary` ao encerrar chamada (incrementa por `classes_worth`)                                               |
| ❌     | Checkout individual com registro de horário de saída                                                                                      |
| ✅     | Token QR Code: SHA-256, uso único, invalidação atômica (`updateMany ... WHERE status='pending'`)                                          |
| ✅     | Sessão de cadastro no Redis (TTL 10min) com estado multi-step                                                                             |
| ✅     | Integração com engine para cadastro de embedding via `POST /enroll/frame`                                                                 |
| ✅     | Finalização de enrollment: média vetorial + re-criptografia via `POST /enroll/finalize`                                                   |
| ✅     | Servir JPEG de fraud frame via stream com verificação de `tenant_id` + role                                                               |
| ✅     | Invalidação de DEK cache na engine ao rotacionar chave (`DELETE /cache/dek/{tenant_id}`)                                                  |
| ✅     | Verificação de status do tenant no Redis (cache 60s) — no JWT (`validateTenantActive`) e no device auth                                   |

---

## 6. Face Engine (Python/FastAPI)

### 6.1 Endpoints Implementados

| Status | Endpoint                                     | Observação                                                       |
| ------ | -------------------------------------------- | ---------------------------------------------------------------- |
| ✅     | `POST /recognize`                            | Pipeline completo: SCRFD → liveness → HSV → ArcFace → comparação |
| ✅     | `POST /embeddings/register`                  | Detecta face, extrai embedding, criptografa e retorna            |
| ✅     | `DELETE /embeddings/{tenant_id}/{person_id}` | Invalida cache em memória                                        |
| ✅     | `POST /cache/warm`                           | Popula cache com candidatos da turma                             |
| ✅     | `GET /health`                                | Status dos modelos carregados                                    |
| ✅     | `POST /calibrate`                            | Calibração de thresholds                                         |
| ✅     | `POST /enroll/frame`                         | Processa frame individual no fluxo de cadastro QR Code           |
| ✅     | `POST /enroll/finalize`                      | Calcula média vetorial, normaliza L2, re-criptografa             |
| ✅     | `DELETE /cache/dek/{tenant_id}`              | Invalida DEK de tenant em cache ao rotacionar chave              |

### 6.2 Engine — Pipeline e Modelos

| Status | Funcionalidade                                                                        |
| ------ | ------------------------------------------------------------------------------------- |
| ✅     | SCRFD (detector de faces, `det_score ≥ 0.75`)                                         |
| ✅     | ArcFace R50 (embeddings 512d, normalizados L2)                                        |
| ✅     | MiniFASNet v1 + v2 (liveness — `v1 * 0.4 + v2 * 0.6`)                                 |
| ✅     | Análise HSV de saturação (penalização, não bloqueio isolado)                          |
| ✅     | Comparação vetorizada NumPy (`candidate_matrix @ query`)                              |
| ✅     | Salvamento de fraud frames em disco (fire-and-forget, async)                          |
| ✅     | Cache em memória de embeddings por tenant (`{tenant_id: {person_id: ndarray}}`)       |
| ✅     | Cache de DEK em memória por tenant (TTL 1h)                                           |
| ✅     | Envelope encryption DEK/MASTER_KEY na engine                                          |
| ✅     | `liveness_threshold_enrollment` separado e mais rigoroso no fluxo de cadastro         |
| ✅     | Pipeline `enroll/frame`: SCRFD (`det_score ≥ 0.80`, configurável) + liveness + ArcFace |
| ✅     | `enroll/finalize`: média vetorial de N embeddings + normalização L2 + re-criptografia |

---

## 7. Testes

### 7.1 Face Engine — Testes Existentes

| Status | Teste                                                                           | Cobertura                           |
| ------ | ------------------------------------------------------------------------------- | ----------------------------------- |
| ✅     | `TestEmbeddingCrypto::test_encrypt_returns_tuple`                               | Formato da saída de criptografia    |
| ✅     | `TestEmbeddingCrypto::test_ciphertext_length`                                   | Tamanho do ciphertext (2048 bytes)  |
| ✅     | `TestEmbeddingCrypto::test_encrypt_decrypt_roundtrip`                           | Cifrar → decifrar recupera original |
| ✅     | `TestEmbeddingCrypto::test_different_ivs_each_encrypt`                          | IV único por operação               |
| ✅     | Testes de cache em memória (`test_cache.py`)                                    |
| ✅     | Testes do pipeline de engine (`test_engine.py`)                                 |
| ✅     | Teste de liveness avançado (`liveness_advanced.py`)                             |
| ✅     | Teste de integração com candidatos reais (`test_integration.py`, 40 candidatos) |

### 7.2 Testes Ausentes / Pendentes

| Status | Teste                                              | Descrição                                                                                                     |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ⚠️     | Cache com múltiplos workers                        | Cache em memória por processo — workers Uvicorn não compartilham estado. Não testado com `workers=2`          |
| ✅     | **Reconhecimento com DEKs diferentes por tenant**  | `tests/test_security_isolation.py` — decifrar com DEK errada lança `InvalidTag`, nunca "identified" incorreto |
| ✅     | **Cross-tenant isolation**                         | `tests/test_security_isolation.py` (engine) + `tests/facial-payload.test.ts` (backend: candidatos por tenant) |
| ✅     | `InvalidTag` ao adulterar ciphertext               | Engine (`test_security_isolation.py`) e backend (`tests/crypto.test.ts`)                                      |
| ❌     | Threshold de liveness diferenciado no enrollment   | Exige modelos ONNX carregados — pendente de teste de integração                                               |
| ✅     | `enroll/finalize` — consistência da média vetorial | `TestEnrollFinalizeMath` — média + renormalização L2, roundtrip cifrado                                       |
| ✅     | Expiração e limpeza do cache de DEK (TTL 1h)       | `TestDekCacheLifecycle::test_expired_dek_is_evicted`                                                          |
| ✅     | Testes de endpoint `DELETE /cache/dek/{tenant_id}` | `TestDekCacheLifecycle::test_invalidate_tenant_dek`                                                           |
| ✅     | Testes automatizados de backend (Vitest)           | `backend/tests/` — 24 testes (`npm test`)                                                                     |
| ❌     | Testes de integração backend ↔ engine              | Pipeline completo de reconhecimento ponta a ponta com banco real                                              |
| ✅     | Testes de autenticação — JWT expirado              | `tests/authenticate.test.ts`                                                                                  |
| ✅     | Testes de autenticação — refresh token rotacionado | `tests/auth-refresh.test.ts` — replay retorna 401                                                             |
| ✅     | Testes de isolamento de tenant no backend          | `tests/enrollment-token.test.ts` + `tests/facial-payload.test.ts`                                             |

---

## 8. Frontend

| Status | Funcionalidade                                                                          |
| ------ | --------------------------------------------------------------------------------------- |
| ❌     | Estrutura Next.js 14 (App Router) criada                                                |
| ❌     | Layout base com ShadCN/UI + Tailwind                                                    |
| ❌     | Autenticação: login, armazenamento seguro de tokens, renovação automática com refresh   |
| ❌     | Interceptor de `401` → chama `/auth/refresh` → retry automático                         |
| ❌     | **Super Admin Dashboard**                                                               |
| ❌     | → Lista de tenants com status, plano, contagem de usuários                              |
| ❌     | → Volume de reconhecimentos por tenant (últimos 7 dias)                                 |
| ❌     | → Saúde da engine (GET /health)                                                         |
| ❌     | → Gestão de planos e limites                                                            |
| ❌     | → Ações: suspender tenant, alterar plano                                                |
| ❌     | **Tenant Dashboard — Admin/Manager**                                                    |
| ❌     | → Cadastro de alunos (dados básicos + foto)                                             |
| ❌     | → Gestão de turmas, cursos e períodos letivos                                           |
| ❌     | → Definição de `total_classes_planned` por turma                                        |
| ❌     | → Visualização de `facial_status` de cada aluno                                         |
| ❌     | → Geração, revogação e re-impressão de QR Codes                                         |
| ❌     | → Configurações de threshold e modos de operação                                        |
| ❌     | → Relatórios de frequência por aluno, turma e período                                   |
| ❌     | → Logs de reconhecimento do dia                                                         |
| ❌     | **Tenant Dashboard — Professor**                                                        |
| ❌     | → Abrir chamada (informa `classes_worth`)                                               |
| ❌     | → Lista de presença em tempo real via SSE (`EventSource`)                               |
| ❌     | → Liberar checkout individual de alunos                                                 |
| ❌     | → Fechar chamada                                                                        |
| ❌     | → Ajuste manual de presença com rastreabilidade                                         |
| ❌     | **Totem PWA** (`/totem/{device_token}`)                                                 |
| ❌     | → Modo reconhecimento: loop automático de captura (sem interação)                       |
| ❌     | → Camada 1 anti-spoofing: variação de pixels em JS (Canvas API, 3 frames × 250ms)       |
| ❌     | → Exibição de nome + feedback por 3s após reconhecimento                                |
| ❌     | → SSE: atualização em tempo real do status da chamada                                   |
| ❌     | → Modo cadastro (`registration_mode`): QR Scan → regulamento LGPD → captura multi-frame |
| ❌     | → Feedback visual por frame: verde (ok) / vermelho (reliveness, repetir)                |
| ❌     | → Sessão de cadastro expira em 10min no Redis — totem retorna ao modo normal            |

---

## 9. Segurança e LGPD

| Status | Item                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| ✅     | IV AES-GCM sempre gerado com `crypto.randomBytes(12)` / `os.urandom(12)` — por operação           |
| ✅     | DEK nunca trafega em plaintext entre serviços                                                     |
| ✅     | MASTER_KEY nunca hardcoded — apenas em env vars                                                   |
| ✅     | `InvalidTag` GCM nunca silenciado na engine                                                       |
| ✅     | Token QR Code armazenado como SHA-256 — token bruto descartado após geração                       |
| ✅     | Refresh token armazenado no Redis (opaco) — não como JWT                                          |
| ✅     | Validação que `InvalidTag` nunca é silenciado no **backend** (crypto.ts + testes)                 |
| ❌     | Política de privacidade do tenant mencionando retenção de fraud frames (24h)                      |
| ✅     | Registro formal de consentimento LGPD em `biometric_consents` antes de qualquer embedding         |
| ✅     | Suporte a revogação de consentimento com exclusão de embedding (`POST /users/:id/revoke-consent`) |
| ✅     | Endpoint de exclusão completa de dados de aluno (LGPD — `DELETE /users/:id/data`)                 |
| ✅     | Fraud frames acessíveis apenas por `admin/manager` do mesmo tenant — validado no endpoint         |
| ✅     | Rotação de DEK por tenant com re-cifragem de embeddings e invalidação de cache                    |
| ✅     | Job diário de limpeza de fraud frames com `audit_cleanup_logs`                                    |

---

## 10. Banco de Dados

| Status | Item                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| ✅     | Schema completo inicial (migration `20260509025903`)                                                 |
| ✅     | Tables: `plans`, `tenants`, `tenant_settings`, `users`, `tenant_keys`, `facial_embeddings`           |
| ✅     | Tables: `devices`, `locations`, `academic_periods`, `courses`, `classes`, `class_enrollments`        |
| ✅     | Tables: `class_sessions`, `attendance_records`, `student_class_summary`, `pre_attendances`           |
| ✅     | Tables: `recognition_logs`, `audit_cleanup_logs`                                                     |
| ✅     | Migration de enrollment: `enrollment_tokens`, `biometric_consents`, campo `facial_status` em `users` |
| ✅     | Índices críticos criados (API Key, presença, QR Code, auditoria)                                     |
| ❌     | Seed de dados de desenvolvimento (planos, tenant demo, alunos de teste)                              |
| ❌     | Migration para `devices` e `locations` (verificar se está na migration inicial)                      |

---

## 11. Roadmap Pós-MVP (Fase 2 — 3–6 meses)

| Status | Item                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| ❌     | App mobile nativo (React Native) com modo Lock Task (quiosque Android)       |
| ❌     | BullMQ para filas assíncronas de reconhecimento                              |
| ❌     | Redis para warm cache da engine (substituindo cache em memória por processo) |
| ❌     | Schema PostgreSQL separado por tenant (isolamento completo de performance)   |
| ❌     | Exportação de relatórios em CSV e PDF                                        |
| ❌     | Integração com sistemas de gestão escolar (TOTVS Educacional, SIE)           |

## 12. Roadmap Pós-MVP (Fase 3 — 6–12 meses)

| Status | Item                                                                 |
| ------ | -------------------------------------------------------------------- |
| ❌     | Anti-spoofing de segunda geração (análise de Fourier + depth sensor) |
| ❌     | Relatórios de frequência em formato exigido pelo MEC                 |
| ❌     | Multi-região (latência < 100ms para qualquer estado brasileiro)      |
| ❌     | API pública para integração com sistemas terceiros                   |

---

## Notas e Ressalvas

### ⚠️ Cache da engine com múltiplos workers

O cache em memória da engine (`{tenant_id: {person_id: ndarray}}`) é **por processo**. Com `workers=2` no Uvicorn, cada worker tem seu próprio dicionário. Um warm cache feito pelo Node não garante que ambos os workers estejam populados. Isso pode causar cache miss no segundo worker. Solução pós-MVP: migrar cache para Redis.

### ⚠️ Reconhecimento com DEKs diferentes por tenant — NÃO TESTADO

O isolamento criptográfico por tenant (DEK única por tenant) foi **implementado mas não testado com cenário real de múltiplos tenants**. É necessário criar um teste que:

1. Cadastra embedding com DEK do tenant A
2. Tenta reconhecer usando DEK do tenant B
3. Verifica que o resultado é `InvalidTag` (não identificado por erro criptográfico)

Esse teste é crítico para garantir isolamento de dados biométricos em produção.

### ⚠️ Seed de desenvolvimento ausente

Não há seed para ambiente de desenvolvimento. Para testar manualmente, é necessário criar planos, tenants, usuários e turmas via API ou diretamente no banco. Criar um `scripts/seed.ts` completo facilitaria o desenvolvimento.

### ✅ Rotação de senha do Super Admin — RESOLVIDO

Implementada a rota `POST /admin/rotate-password` (super_admin autenticado, exige senha atual, nova senha ≥ 12 caracteres). Não é mais necessário deletar o registro manualmente.
