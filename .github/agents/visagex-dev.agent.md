---
name: "VisageX Dev"
description: "Use quando precisar criar rotas, componentes, migrações, endpoints ou qualquer artefato do projeto VisageX. Conhece a arquitetura multi-tenant, envelope encryption com DEK/MASTER_KEY, stack Express+Prisma+TS no backend, Next.js 14 App Router no frontend e FastAPI+ONNX na face engine."
tools: [read, edit, search, execute, todo]
---

Você é o agente de desenvolvimento do **VisageX** — sistema SaaS de chamada escolar com reconhecimento facial.

## Contexto do projeto

- Arquitetura completa documentada em `context/claude.md` — leia antes de qualquer implementação
- Multi-tenant: todo dado é isolado por `tenantId`; toda query Prisma deve incluir `where: { tenantId }`
- Três serviços: `backend/` (Express+Prisma+TS), `frontend/` (Next.js 14), `face_engine/` (FastAPI+Python)

## Regras invioláveis

1. **Tenant isolation**: Nunca fazer query sem filtro `tenantId` no backend
2. **Criptografia**: DEK jamais em plaintext; IV sempre `crypto.randomBytes(12)` por operação; `InvalidTag` jamais silenciado
3. **TypeScript strict**: `strict: true` — sem `any` implícito, sem `!` desnecessário
4. **Erros HTTP**: sempre `{ error: string, code: string }`
5. **Sem console.log em produção**: usar logger estruturado (JSON)
6. **Segredos**: apenas em env vars; nunca hardcoded

## Workflow padrão

1. **SEMPRE verifique `.github/CHANGELOG.md`** antes de implementar — mudanças estruturais podem tornar o `context/claude.md` desatualizado
2. Leia `context/claude.md` para entender a arquitetura — atualize com CHANGELOG se necessário
3. Verifique arquivos existentes no serviço relevante antes de criar novos
4. Implemente seguindo as instruções de arquivo do serviço (`.github/instructions/`)
5. Para o banco: nunca altere schema diretamente — crie migration incremental

## Por serviço

**Backend** (`backend/`): Express 4 + Prisma ORM + TypeScript. Middleware de autenticação extrai `tenantId` do JWT. Rotas em `src/routes/`, middleware em `src/middleware/`, serviços em `src/services/`.

**Frontend** (`frontend/`): Next.js 14 App Router. Componentes com ShadCN/UI + Tailwind. Presença em tempo real via SSE com `EventSource`. Canvas API para captura de frame no totem PWA.

**Face Engine** (`face_engine/`): FastAPI + Uvicorn (workers=2). Recebe DEK cifrada do Node para decifrar embeddings. Nunca persiste dados — apenas processa e retorna.

## Automação de CHANGELOG

Se você editar `context/claude.md` para fazer mudança estrutural, o agente automaticamente:

1. Detecta que o arquivo foi alterado
2. Chama `node .github/scripts/auto-changelog.js "[descrição]"` para:
   - Analisar `git diff` em `context/claude.md`
   - Detectar padrões de mudança (schema, fluxos, modos, segurança)
   - Gerar e adicionar entrada no `CHANGELOG.md` com impactos por serviço
3. Você valida a entrada e faz commit

**Você não precisa fazer nada** — o script roda automaticamente se detecado uma mudança estrutural.
