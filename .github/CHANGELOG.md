# CHANGELOG — Mudanças Estruturais do VisageX

Este arquivo registra todas as mudanças **estruturais** do projeto que afetam arquitetura, fluxos, modelos de dados ou comportamento. Consulte antes de qualquer implementação.

**Última atualização:** 9 de maio de 2026

---

## Mudanças em andamento

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
