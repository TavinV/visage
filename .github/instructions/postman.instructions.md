---
description: "Use quando criar novas rotas Express no backend VisageX. Descreve como criar e manter os arquivos YAML da coleção Postman em postman/postman/collections/VisageX API/."
applyTo: "backend/src/routes/**"
---

# Postman — Coleção YAML (Postman File-Based Collection)

Toda rota nova no backend **deve ter um arquivo `.request.yaml` correspondente** na coleção Postman localizada em:

```
postman/postman/collections/VisageX API/
```

## Estrutura de pastas

Cada domínio de rotas corresponde a uma **pasta com emoji** dentro de `collections/VisageX API/`:

```
📁 <Emoji> <Nome do Domínio>/
    .resources/
        definition.yaml     ← metadados da pasta (obrigatório)
    <Ação>.request.yaml     ← um arquivo por endpoint
    <Ação>.request.yaml
    ...
```

**Pastas existentes:**
| Pasta | Arquivo de rota |
|---|---|
| `🏥 Health/` | `health.ts` |
| `🔐 Auth/` | `auth.ts` |
| `📋 Plans (super_admin)/` | `plans.ts` |
| `🏢 Tenants (super_admin)/` | `tenants.ts` |
| `⚙️ Tenant Settings/` | `tenant-settings.ts` |
| `👥 Users/` | `users.ts` |
| `📍 Locations/` | `locations.ts` |
| `📱 Devices/` | `devices.ts` |
| `📅 Academic Periods/` | `academic-periods.ts` |
| `📚 Courses/` | `courses.ts` |
| `🎓 Classes/` | `classes.ts` |
| `📝 Class Enrollments/` | `class-enrollments.ts` |
| `🗓️ Class Sessions/` | `class-sessions.ts` |

Para um **domínio novo**, crie uma pasta nova com emoji e inclua o `definition.yaml`.

## Formato — `definition.yaml` (pasta)

```yaml
$kind: collection
description: <Descrição curta do domínio em português.>
order: <número inteiro, múltiplos de 1000, sequencial por posição na coleção>
```

## Formato — `<Ação>.request.yaml` (request)

```yaml
$kind: http-request
name: <Nome legível> # opcional; se omitido, usa o nome do arquivo
description: <Descrição curta> # opcional mas recomendado
url: "{{baseUrl}}/<path>"
method: GET | POST | PATCH | PUT | DELETE
headers: # inclua apenas se necessário
  Content-Type: application/json
body: # apenas para POST/PATCH/PUT
  type: text
  content: |-
    {
      "campo": "valor"
    }
auth: # inclua APENAS para rotas públicas
  type: noauth
scripts:
  - type: afterResponse
    code: |-
      <script PM>
    language: text/javascript
order: <número inteiro, múltiplos de 1000, sequencial dentro da pasta>
```

## Regras de autenticação

- **Omitir `auth`** → o request herda o bearer `{{accessToken}}` definido na coleção (padrão para rotas protegidas).
- **`auth: { type: noauth }`** → apenas para rotas públicas (`/health`, `/auth/login`, `/auth/refresh`).

## Regras de scripts (`afterResponse`)

- Sempre usar `pm.collectionVariables.set/get` — **nunca** `pm.globals` nem `pm.environment`.
- Todo POST de criação salva o ID do recurso criado:
  ```javascript
  pm.test("201 Created", () => pm.response.to.have.status(201));
  const { data } = pm.response.json();
  pm.collectionVariables.set("created<Domínio>Id", data.id);
  console.log("[Domínio] created<Domínio>Id =", data.id);
  ```
- Variáveis de ID seguem o padrão `created<Domínio>Id` (camelCase):
  - `createdPlanId`, `createdTenantId`, `createdUserId`, `createdLocationId`, `createdDeviceId`
  - `createdAcademicPeriodId`, `createdCourseId`, `createdClassId`, `createdClassSessionId`
  - Para novos domínios: `created<NomeDomínio>Id`
- GET/PATCH/DELETE usam `{{created<Domínio>Id}}` na URL — sem script obrigatório.
- Testes de status: usar `pm.test('<status> <Descrição>', () => pm.response.to.have.status(<code>));`

## Quando criar pasta nova (domínio novo)

1. Escolha um emoji representativo.
2. Crie a pasta: `postman/postman/collections/VisageX API/<Emoji> <Nome>/`
3. Crie `.resources/definition.yaml` com `$kind`, `description` e `order`.
4. Adicione uma variável de ID em `postman/postman/collections/VisageX API/.resources/definition.yaml`:
   ```yaml
   created<Domínio>Id: ""
   ```
5. Crie os requests `.request.yaml` dentro da pasta.

## Nomenclatura dos arquivos `.request.yaml`

| Operação            | Nome do arquivo                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| Listar todos        | `List.request.yaml`                                                               |
| Buscar por ID       | `Get by ID.request.yaml`                                                          |
| Buscar por critério | `Get by <critério>.request.yaml`                                                  |
| Criar               | `Create.request.yaml` ou `Create — <Variante>.request.yaml`                       |
| Atualizar           | `Update.request.yaml`                                                             |
| Deletar / Desativar | `Delete.request.yaml` ou `Deactivate (soft delete).request.yaml`                  |
| Ação específica     | `<Verbo> <Complemento>.request.yaml` (ex.: `Change Password (self).request.yaml`) |

## Valores de `order`

- Incremente de 1000 em 1000 dentro de cada pasta.
- Convecção padrão dentro de uma pasta CRUD:
  ```
  List:         1000
  Create:       2000
  Get by ID:    3000
  Update:       4000
  Delete:       5000
  ```
- Para a pasta raiz da coleção, use a ordem da tabela de pastas acima (Health=1000, Auth=2000, Plans=3000, …).

## Workflow ao criar nova rota no backend

Ao criar ou editar `backend/src/routes/<domínio>.ts`, faça **também** as alterações abaixo na coleção:

1. **Rota nova em pasta existente** → crie apenas o arquivo `.request.yaml` correspondente.
2. **Domínio novo** → crie a pasta, o `definition.yaml` e todos os requests do domínio, e adicione `created<Domínio>Id: ""` no `definition.yaml` raiz da coleção.
3. **Rota removida** → remova o arquivo `.request.yaml` correspondente.
4. **Mudança de path/method** → edite o arquivo `.request.yaml` correspondente.

## Exemplo completo — POST /enrollment

Arquivo: `postman/postman/collections/VisageX API/📝 Class Enrollments/Create.request.yaml`

```yaml
$kind: http-request
name: Create
description: Matricula um aluno em uma turma. Requer `createdClassId` e `createdUserId`.
url: "{{baseUrl}}/class-enrollments"
method: POST
headers:
  Content-Type: application/json
body:
  type: text
  content: |-
    {
      "classId": "{{createdClassId}}",
      "userId": "{{createdUserId}}"
    }
scripts:
  - type: afterResponse
    code: |-
      pm.test('201 Created', () => pm.response.to.have.status(201));
      const { data } = pm.response.json();
      pm.collectionVariables.set('createdEnrollmentId', data.id);
      console.log('[ClassEnrollments] createdEnrollmentId =', data.id);
    language: text/javascript
order: 2000
```
