# Postman — VisageX API

Coleção oficial do backend Express. Importe `VisageX API.postman_collection.json` no Postman (File → Import).

## Convenções (importantes para evolução)

- **Todas as variáveis são da coleção** — definidas em `collection.variable[]`. Scripts SEMPRE usam `pm.collectionVariables.set/get`. **Nunca `pm.globals`** nem `pm.environment`.
- **Auth herdado**: a coleção tem `auth: bearer { token: {{accessToken}} }`. Cada request herda — só sobrescreve com `noauth` quem é público (`/health`, `/auth/*`).
- **Login salva contexto em dois lugares**:
  - genérico (`accessToken`, `refreshToken`, `tenantId`, `userId`, `currentRole`) → consumido por todos os requests
  - específico do contexto (`superAdminAccessToken`, `umcAccessToken`, `senaiAccessToken`) → permite trocar de papel rápido manualmente
- **POSTs de criação salvam o ID** numa variável `createdXxxId` (ex.: `createdPlanId`, `createdUserId`). Os GETs/PATCHes/DELETEs subsequentes usam `{{createdXxxId}}` por padrão.
- **Test global**: qualquer resposta ≥ 400 é validada contra o contrato `{ error, code }`.
- **Documentação** mora no campo `description` de cada folder/request.

## Como pedir adições

Quando quiser uma rota nova ou ajuste, peça em PT-BR com:

> "Adiciona no Postman a rota `POST /algo` na pasta `Algo`, com body X e teste que salva Y em `createdAlgoId`."

Eu edito **apenas** o item necessário, sem reescrever a coleção inteira.

## Fluxo de smoke test (ordem dos requests)

1. `Health → Check`
2. `Auth → Login — Super Admin`
3. `Plans → List` → pega um `planId` ativo e cola em `createdPlanId`
4. `Tenants → Create — UMC` (precisa de `createdPlanId`)
5. `Tenants → Create — SENAI`
6. `Auth → Login — UMC Admin` (a senha veio no e-mail do `adminUser`)
7. `Locations → Create`, `Devices → Create`, etc.

## Credenciais de dev

Configuradas como variáveis da coleção — alteráveis em **Edit Collection → Variables**:

| Variável             | Default                            |
| -------------------- | ---------------------------------- |
| `superAdminEmail`    | `admin@visagex.local`              |
| `superAdminPassword` | `Ota@47802341825`                  |
| `umcEmail`           | `otavioviniciusads@gmail.com`      |
| `umcPassword`        | `Ota@181207`                       |
| `senaiEmail`         | `otavioviniciusflauzino@gmail.com` |
| `senaiPassword`      | `Ota@181207`                       |

> ⚠️ Em produção, **nunca** versionar credenciais — substitua pelos seus próprios valores antes de compartilhar.
