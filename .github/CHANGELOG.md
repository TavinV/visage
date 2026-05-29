# CHANGELOG — Mudanças Estruturais do VisageX

Este arquivo registra todas as mudanças **estruturais** do projeto que afetam arquitetura, fluxos, modelos de dados ou comportamento. Consulte antes de qualquer implementação.

**Última atualização:** 28 de maio de 2026

---

## Mudanças em andamento

### CPF como Identificador de Consentimento + Normalização de Documentos

- **Data:** 28 de maio de 2026
- **Status:** Em progresso
- **Migration:** `20260528120000_add_cpf_uniqueness_and_normalize_documents`
- **Descrição:** O CPF do aluno passa a ser o identificador primário no fluxo de consentimento. O QR code apresentado no totem é um payload AES-256-GCM do CPF cifrado com `QR_SECRET_KEY` (separada da `MASTER_KEY`). Todos os documentos (CPF em `users` e CNPJ em `tenants`) são normalizados no banco — armazenados **apenas como dígitos**, sem pontos, hífens ou barras.
- **Impactos:**
  - **Banco de dados:**
    - `users.document`: normalizado para 11 dígitos (CPF); novo índice único em `(tenantId, document)` — NULLs não conflitam (comportamento nativo PostgreSQL)
    - `tenants.document`: normalizado para até 14 dígitos (CNPJ); VarChar reduzido de 20 para 14
    - Migration aplica `TRANSLATE(document, '.-', '')` em `users` e `TRANSLATE(document, '.-/', '')` em `tenants` para dados existentes
  - **Backend:**
    - Nova var de ambiente obrigatória: `QR_SECRET_KEY` (64 hex chars = 32 bytes)
    - `validateConfig()` valida o comprimento de `QR_SECRET_KEY` no startup
    - Novo utilitário `src/utils/cpfQr.ts`:
      - `normalizeDocument(doc)` — remove pontuação de CPF/CNPJ antes de persistir
      - `isValidCpf(cpf)` / `isValidCnpj(cnpj)` — validação de formato normalizado
      - `generateCpfQrPayload(tenantId, cpf)` → base64url (IV 12b + tag 16b + ciphertext)
      - `decodeCpfQrPayload(encoded)` → `{ tenantId, cpf }` — InvalidTag re-lançado como `ValidationError`, nunca silenciado
    - Fluxo de consentimento no totem: scan QR → backend decifra payload → encontra usuário por `(tenantId, cpf)` → exibe nome → consent → captura facial
  - **Frontend:** Totem deve gerar/exibir QR code a partir do payload retornado pelo backend; campo CPF no formulário de cadastro deve ser mascarado mas salvo sem formatação
  - **Engine Python:** Sem impacto
- **Motivo:** CPF é o documento de identidade nacional — elimina necessidade de entregar tokens físicos individualmente; o QR é auto-contido, regenerável e revogável (basta invalidar o registro do aluno); normalização evita duplicatas por diferença de formatação

### Otimização de Performance — Crop de Face no Browser

- **Data:** 15 de maio de 2026
- **Status:** Documentado e confirmado
- **Descrição:** Decisão arquitetural de pré-recortar a região do rosto no browser antes de enviar à engine Python, reduzindo a área processada pelo SCRFD em ~4× e eliminando a necessidade de redimensionamento na engine. pgvector foi avaliado e descartado — a estratégia de filtro por sala/turno já resolve o problema de escala sem custo de privacidade adicional.
- **Impactos:**
  - **Frontend:**
    - Máscara oval centralizada sobre o feed da câmera (guia posicionamento do rosto)
    - Feedback dinâmico via Face Detection API (Chrome/Edge): oval cinza → verde quando rosto está no tamanho certo; degradação elegante em browsers sem suporte
    - Pipeline de captura passa a operar sobre o crop (bounding box da oval + 25% padding), não o frame completo
    - Crop redimensionado para 320×320px e serializado como JPEG 80% antes do envio
    - A comparação de variação de pixels (Camada 1 anti-spoofing) também opera sobre o crop
  - **Engine Python:**
    - Recebe imagem 320×320 em vez do frame completo (sem alteração de código — compatível)
    - SCRFD processa área menor → latência estimada reduz de ~200ms para ~150ms
    - Redimensionamento interno do SCRFD se torna no-op (imagem já dentro do limite)
  - **Backend Node.js:** Sem impacto
  - **Banco de dados:** Sem impacto
- **Motivo:** Eliminar o bottleneck real do pipeline (SCRFD varrendo frame completo) sem adicionar complexidade ao backend Python ou ao modelo de segurança. pgvector descartado por exigir embeddings em plaintext no PostgreSQL, o que contradiz o modelo de envelope encryption com DEK por tenant.

### Fluxo de Cadastro com QR Code — Enrollment Flow

- **Data:** 9 de maio de 2026
- **Status:** Em progresso
- **Migration:** `20260509211744_enrollment_qrcode_and_consent`
- **Descrição:** Novo fluxo de dois estágios para cadastro biométrico de alunos. Etapa 1: admin cadastra dados básicos e gera QR Code (token uso único com expiração). Etapa 2: aluno vai ao totem, aceita regulamento LGPD formalmente e realiza captura multi-frame com liveness check rigoroso — embedding consolidado salvo automaticamente.
- **Impactos:**
  - **Banco de dados:**
    - Nova tabela `enrollment_tokens`: tokens QR Code com hash SHA-256, uso único, expiração configurável, status rastreável (`pending | used | expired | revoked`)
    - Nova tabela `biometric_consents`: registro formal de consentimento LGPD com versão do texto, device_fingerprint, IP e suporte a revogação
    - Campo `facial_status` adicionado em `users`: `none | consent_given | registered | consent_refused | revoked`
    - 4 novos campos em `tenant_settings`: `enrollment_token_expiry_hours` (72h), `require_consent_before_facial` (true), `enrollment_multi_frame_count` (3), `liveness_threshold_enrollment` (0.90)
  - **Backend:**
    - Novas rotas de gerenciamento de token: `POST/GET/DELETE /api/students/:id/enrollment-token`
    - Novas rotas de enrollment no totem: `POST /api/enrollment/validate-token | /consent | /refuse | /frame | /finalize`
    - Sessão de cadastro temporária no Redis (TTL 10 min) com estado multi-step: `enrollment_session:{uuid}`
    - Token validado atomicamente com `UPDATE ... WHERE status='pending' RETURNING` (sem race condition)
    - Token armazenado como SHA-256 — token bruto descartado após gerar QR, nunca persistido
  - **Face Engine:**
    - Novos endpoints `POST /enroll/frame` e `POST /enroll/finalize`
    - `POST /enroll/frame`: SCRFD (det_score ≥ 0.85) + liveness com threshold configurável + ArcFace → retorna embedding criptografado
    - `POST /enroll/finalize`: recebe N embeddings, calcula média vetorial, normaliza L2, re-criptografa e retorna embedding consolidado
    - Threshold de liveness no cadastro separado e mais rigoroso (padrão 0.90 vs 0.85 no reconhecimento)
  - **Frontend:**
    - Nova tela de cadastro no Totem PWA (`registration_mode`): QR scan → exibição do nome do aluno → regulamento → captura multi-frame com feedback visual → confirmação
    - Novo painel admin para visualizar `facial_status` de cada aluno e gerenciar tokens (gerar, revogar, reimprimir)
  - **LGPD:** Consentimento formal do titular (aluno) registrado em banco antes de qualquer embedding. Suporte a revogação com exclusão de embedding. Versão do texto do regulamento rastreada.
- **Motivo:** Eliminar necessidade de o admin fotografar o aluno presencialmente; garantir consentimento explícito e rastreável do titular conforme LGPD; aumentar segurança do cadastro com liveness multi-frame e token de uso único.

### Autenticação com Access Token + Refresh Token

- **Data:** 9 de maio de 2026
- **Status:** Em progresso
- **Descrição:** O sistema migrou de JWT de longa duração (token único) para o padrão de dois tokens: Access Token de curta duração (15 min) e Refresh Token opaco (7 dias), com rotação automática a cada refresh.
- **Impactos:**
  - **Backend:**
    - `POST /auth/login` agora retorna `{ accessToken, refreshToken, expiresIn, user }` em vez de `{ token, user }`
    - Novos endpoints: `POST /auth/refresh` (troca refresh token por novo access token com rotação) e `POST /auth/logout` (revoga refresh token)
    - Refresh tokens armazenados no Redis com chave `rtoken:{token}` e TTL de 7 dias
    - `JWT_EXPIRES_IN` reduzido para `15m`; nova var `JWT_REFRESH_EXPIRES_IN_SECONDS=604800`
    - `auth.service.ts` reescrito com funções `login`, `refreshAccessToken` e `logout`
  - **Frontend:**
    - Deve armazenar `refreshToken` de forma segura (HttpOnly cookie recomendado ou memória)
    - Deve implementar lógica de renovação automática ao receber `401` com `code: invalid_token`
    - Chamadas autenticadas continuam usando `Authorization: Bearer <accessToken>`
  - **Engine (face_engine):** Sem impacto — a engine não valida JWT diretamente
  - **Banco de dados:** Sem novas tabelas — estado de sessão mantido inteiramente no Redis
- **Motivo:** Reduzir janela de comprometimento de tokens; permitir invalidação imediata de sessão via logout; seguir boas práticas OAuth 2.0

### Super Admin — Modelo Único de Criação (Confirmado)

- **Data:** 9 de maio de 2026
- **Status:** Documentado e confirmado
- **Descrição:** Confirmação de que existe **apenas UM super_admin** em todo o sistema, criado **UMA ÚNICA VEZ** via variáveis de ambiente (`SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD`) durante o bootstrap da aplicação. Nenhuma outra forma de criar, promover ou alterar super_admin.
- **Impactos:**
  - **Backend:**
    - `src/services/admin.service.ts`: Função `bootstrapSuperAdmin()` implementada com validação rigorosa e comentários de bloco explicando a regra
    - `src/index.ts`: Bootstrap executado no startup, idempotente (se já existe, não faz nada)
    - Middleware `requireSuperAdmin` atua apenas como validador, não criador
    - Nenhum endpoint POST/PATCH pode criar ou promover super_admin (implementado como regra de negócio)
    - Env vars obrigatórias em `.env`: `SUPER_ADMIN_EMAIL` (≥12 chars) e `SUPER_ADMIN_PASSWORD`
  - **Frontend:** Super Admin Dashboard acessível apenas com JWT válido de super_admin (gerado em /auth/login)
  - **Engine / Banco:** Sem impacto direto — inteiramente implementado no nível de aplicação
  - **Documentação:** Seção completa em `context/claude.md` explicando a regra e como alterar a senha
  - **Arquivos .env:** Comentários detalhados em `backend/.env.example` e `backend/.env`
- **Motivo:** Implementar modelo de segurança maximalista — acesso administrativo completamente controlado, rastreável e não-escalável via API

---

## Versão atual

### v1.0 — MVP Hackathon UMC 2026 (8 de maio de 2026)

#### ✅ Mudanças confirmadas

1. **Envelope Encryption (DEK/KEK)**
   - Cada tenant tem seu próprio DEK armazenado criptografado em `tenant_keys`
   - Embeddings cifrados com DEK do tenant, não com chave global
   - MASTER_KEY carregada em backend e face-engine para decifrar DEKs
   - Suporte a rotação via `key_version` em `tenant_keys` e `facial_embeddings`

2. **Modos de operação desacoplados**
   - `pre_attendance_enabled` e `individual_checkout_enabled` são flags **independentes** em `tenant_settings`
   - `institution_type` é apenas classificação cadastral (school/university)
   - Qualquer tenant pode habilitar qualquer combinação de modos

3. **Removida all funcionalidade de timeclock**
   - Sem FacePonto product
   - Sem `work_schedules`, `user_schedules`, `punch_records`, `device_bind_codes`
   - Sem geofence (latitude/longitude/radius removido de locations)
   - Sem app mobile — apenas totem PWA em tablet

4. **Responsabilidade de `total_classes_planned`**
   - Definida por **coordenador/admin**, não por professor
   - Campo em tabela `classes`, não em `class_sessions`
   - Professor informa apenas `classes_worth` (peso da sessão: 1 = simples, 2 = dupla)

---

## Como reportar uma mudança estrutural

Se você identificar uma mudança que afeta múltiplos serviços ou modelos de dados:

1. **Documente aqui no CHANGELOG.md** com:
   - Data da mudança
   - Título descritivo (ex: "Autenticação via OAuth em vez de email/senha")
   - Impactos listados por serviço (backend, frontend, engine, banco)
   - Novas tabelas, colunas removidas, fluxos alterados

2. **Atualize `context/claude.md`** com os detalhes completos (isso fica para depois de validar com a equipe)

3. **Notifique o agente** mencionando no chat:
   ```
   Mudança estrutural reportada: [descrição]. Consulte .github/CHANGELOG.md linha XX.
   ```

---

## Template para nova mudança

Copie e cole quando adicionar uma entrada:

```markdown
### [Nome da mudança]

- **Data:** DD de mês de AAAA
- **Status:** Planejado / Em progresso / Concluído
- **Impactos:**
  - Backend: [o que muda]
  - Frontend: [o que muda]
  - Engine: [o que muda]
  - Banco: [tabelas afetadas, novas colunas, etc]
- **Motivo:** [por que essa mudança]
```
