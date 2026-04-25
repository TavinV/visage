# Face Recognition Engine - Endpoints para Postman

**Base URL:** `http://localhost:8001`

**Header obrigatório para todas as rotas (exceto `/` e `/health`):**

```
X-API-Key: <chave de api>
```

---

## 1. GET / (Raiz)

Verificar se a API está rodando.

**Método:** `GET`  
**URL:** `http://localhost:8001/`  
**Headers:** Nenhum necessário  
**Body:** Nenhum

**Response (200 OK):**

```json
{
  "service": "Face Recognition Engine",
  "version": "1.0.0",
  "status": "running"
}
```

---

## 2. GET /health

Verificar status dos modelos (sem autenticação).

**Método:** `GET`  
**URL:** `http://localhost:8001/health`  
**Headers:** Nenhum necessário  
**Body:** Nenhum

**Response (200 OK):**

```json
{
  "status": "ok",
  "models": {
    "detector": true,
    "embedder": true,
    "liveness": true
  }
}
```

**Status possíveis:**

- `"ok"` - Todos os modelos carregados
- `"degraded"` - Alguns modelos não disponíveis (ex: liveness)

---

## 3. POST /recognize

Reconhecer uma face contra lista de embeddings criptografados.

**Método:** `POST`  
**URL:** `http://localhost:8001/recognize`  
**Headers:**

```
X-API-Key: <chave de api>
Content-Type: multipart/form-data
```

**Body (Form Data):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tenant_id` | string | ID do tenant (usado para cache isolado por tenant) |
| `image` | file | Arquivo de imagem (JPG, PNG, etc) |
| `candidates` | string | JSON com lista de embeddings criptografados |

**📊 Otimização de Cache:** A API mantém cache em memória por `tenant_id/person_id`. Se 3 requisições do mesmo tenant incluem os mesmos 20 candidatos, apenas a primeira descriptografa. As demais reutilizam do cache.

**Formato do campo `candidates` (JSON string):**

```json
[
  {
    "person_id": 42,
    "embedding_iv": "hexadecimal_string_12_bytes",
    "embedding_tag": "hexadecimal_string_16_bytes",
    "embedding_ct": "hexadecimal_string_64_bytes"
  },
  {
    "person_id": 15,
    "embedding_iv": "hexadecimal_string_12_bytes",
    "embedding_tag": "hexadecimal_string_16_bytes",
    "embedding_ct": "hexadecimal_string_64_bytes"
  }
]
```

### Respostas possíveis

**200 - Rosto identificado:**

```json
{
  "status": "identified",
  "candidate_index": 0,
  "confidence": 0.95,
  "liveness_score": 0.98,
  "processing_ms": 450
}
```

**Nota:** `candidate_index: 0` refere-se ao primeiro elemento do array `candidates` enviado (person_id: 42).

**200 - Nenhuma face detectada:**

```json
{
  "status": "no_face_detected",
  "processing_ms": 150
}
```

**200 - Face não passou em liveness (spoofing detectado):**

```json
{
  "status": "liveness_failed",
  "liveness_score": 0.42,
  "processing_ms": 300
}
```

**200 - Nenhum match encontrado:**

```json
{
  "status": "not_identified",
  "processing_ms": 400
}
```

**400 - Imagem inválida:**

```json
{
  "detail": "Imagem inválida ou não decodificável"
}
```

**422 - Embedding corrompido:**

```json
{
  "detail": "Embedding corrompido ou adulterado (InvalidTag)"
}
```

---

## 4. POST /embeddings/register

Registrar novo embedding para uma pessoa (com 1-5 imagens).

**Método:** `POST`  
**URL:** `http://localhost:8001/embeddings/register`  
**Headers:**

```
X-API-Key: <chave de api>
Content-Type: multipart/form-data
```

**Body (Form Data):**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tenant_id` | string | ID do tenant |
| `person_id` | integer | ID da pessoa |
| `files` | file[] | 1 a 5 imagens (JPEG, PNG) |

**Exemplo no Postman:**

- Em "Body" → "form-data"
- Adicione 3 chaves:
  - `tenant_id` (Text): `customer_123`
  - `person_id` (Text): `789`
  - `files` (File): Selecione até 5 imagens

**Response (200 OK):**

```json
{
  "person_id": 789,
  "embedding_iv": "a1b2c3d4e5f6a1b2c3d4e5f6",
  "embedding_tag": "f1e2d3c4b5a6f7e8d9c0b1a2",
  "embedding_ct": "longohexadecimalcomciphertext...",
  "model_version": "arcface_r50_v1",
  "images_processed": 3
}
```

**Campos de retorno:**

- `embedding_iv`: IV (12 bytes) em hexadecimal
- `embedding_tag`: Tag GCM (16 bytes) em hexadecimal
- `embedding_ct`: Ciphertext AES-256-GCM (64 bytes) em hexadecimal
- `images_processed`: Quantas imagens foram processadas com sucesso

**Erros:**

```json
{
  "detail": "Nenhuma face detectada em nenhuma das imagens fornecidas"
}
```

```json
{
  "detail": "Máximo de 5 imagens permitidas"
}
```

---

## 5. DELETE /embeddings/{tenant_id}/{person_id}

Invalidar/remover embedding do cache.

**Método:** `DELETE`  
**URL:** `http://localhost:8001/embeddings/{tenant_id}/{person_id}`  
**Headers:**

```
X-API-Key: <chave de api>
```

**Exemplo:** `http://localhost:8001/embeddings/customer_123/789`

**URL Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `tenant_id` | string | ID do tenant |
| `person_id` | integer | ID da pessoa |

**Response (200 OK):**

```json
{
  "invalidated": true
}
```

---

## Fluxo de Uso Completo

### 1️⃣ Registrar uma pessoa (POST /embeddings/register)

**Responsabilidade: API Node.js**

- Node.js autentica o usuário
- Valida que `tenant_id` e `person_id` pertencem ao usuário autenticado
- Envia 3-5 fotos para a API de reconhecimento
- Armazena o embedding criptografado no banco de dados

### 2️⃣ Reconhecer uma face (POST /recognize)

**Responsabilidade dividida:**

**API Node.js:**

1. Autentica o usuário
2. Busca todos os embeddings associados àquele tenant no banco
3. Monta o array de `candidates`
4. Chama `/recognize` com a foto + array

**API de Reconhecimento (Python):**

1. Recebe a foto + array genérico de candidates
2. Retorna `candidate_index` do melhor match

**API Node.js (continuação):**

1. Sabe que `candidate_index: 0` corresponde a `person_id: 42` (porque ela construiu o array)
2. Faz login do usuário

### 3️⃣ Remover uma pessoa (DELETE /embeddings/{tenant_id}/{person_id})

**Responsabilidade: API Node.js**

- Valida permissões
- Remove embedding do banco de dados
- Opcionalmente invalida cache local

---

## Arquitetura: Separação de Responsabilidades

```
┌─────────────────────────────────────────────────────────┐
│           Frontend / Mobile App                         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│         API Node.js (Aplicação)                         │
│  ✓ Autenticação de usuário                              │
│  ✓ Autorização (tenant_id, person_id)                   │
│  ✓ Persistência no banco de dados                       │
│  ✓ Lógica de negócio                                    │
│  ✓ Mapear candidate_index → person_id                   │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ↓                           ↓
┌────────────────────┐     ┌────────────────────┐
│ /embeddings/       │     │ /recognize         │
│  register          │     │ (stateless ML API) │
│                    │     │                    │
│ Input:             │     │ Input:             │
│ - tenant_id        │     │ - image            │
│ - person_id        │     │ - candidates[]     │
│ - files[]          │     │                    │
│                    │     │ Output:            │
│ Output:            │     │ - candidate_index  │
│ - embedding_*      │     │ - confidence       │
│   (criptografado)  │     │ - liveness_score   │
└────────────────────┘     └────────────────────┘
     (Persistida no DB)        (Pura ML, sem BD)
```

**Princípio:** A API de reconhecimento é **agnóstica** à estrutura de negócio. Ela não sabe (nem precisa saber) sobre tenant_id, person_id, ou banco de dados. Retorna apenas índices. O contexto é mantido pela API Node.js.

---

## Exemplo Prático: Reconhecimento em Lote com Cache

### Cenário: Banco ABC com 20 usuários, 3 reconhecimentos

**Setup:** Todos os 20 usuários estão cadastrados com embeddings no banco Node.js.

**Reconhecimento 1: João faz login**

```bash
# Node.js busca no BD todos os 20 usuários cadastrados
SELECT person_id, embedding_iv, embedding_tag, embedding_ct FROM users WHERE tenant_id = 'banco_abc'

# Monta array de 20 candidates
candidates = [
  {person_id: 1, embedding_iv: "...", embedding_tag: "...", embedding_ct: "..."},
  {person_id: 2, embedding_iv: "...", embedding_tag: "...", embedding_ct: "..."},
  ...
  {person_id: 20, embedding_iv: "...", embedding_tag: "...", embedding_ct: "..."}
]

# Chama a API de ML
POST http://localhost:8001/recognize
Form:
  tenant_id: "banco_abc"
  image: foto_de_joao.jpg
  candidates: [JSON array acima com 20 items]

# ⚙️ INTERNO DA API:
# 1. Cache vazio para banco_abc
# 2. Descriptografa 20 embeddings (operação custosa)
# 3. Armazena no cache: cache[banco_abc] = {1: emb, 2: emb, ..., 20: emb}
# 4. Compara com todos
# 5. Encontra melhor match no índice 0 (person_id: 1 = João)

# Resposta
{
  "status": "identified",
  "candidate_index": 0,
  "confidence": 0.98,
  "liveness_score": 0.99,
  "processing_ms": 450  ← Lento (primeira requisição, descriptografia)
}

# Node.js: candidate_index = 0 → candidates[0].person_id = 1 → Login de João ✓
```

**Reconhecimento 2: Maria tenta login (5 segundos depois)**

```bash
# Node.js monta MESMO array de 20 candidates
candidates = [
  {person_id: 1, embedding_iv: "...", embedding_tag: "...", embedding_ct: "..."},
  ...
  {person_id: 20, embedding_iv: "...", embedding_tag: "...", embedding_ct: "..."}
]

POST http://localhost:8001/recognize
Form:
  tenant_id: "banco_abc"
  image: foto_de_maria.jpg
  candidates: [MESMO array]

# ⚙️ INTERNO DA API:
# 1. Cache JÁ EXISTS para banco_abc com 20 embeddings
# 2. Busca no cache por person_id 1-20
# 3. Encontra todos os 20 NO CACHE (sem descriptografar!)
# 4. Compara com todos
# 5. Encontra melhor match no índice 14 (person_id: 15 = Maria)

# Resposta
{
  "status": "identified",
  "candidate_index": 14,
  "confidence": 0.97,
  "liveness_score": 0.98,
  "processing_ms": 120  ← RÁPIDO! (50% do tempo anterior - apenas comparação)
}

# Node.js: candidate_index = 14 → candidates[14].person_id = 15 → Login de Maria ✓
```

**Reconhecimento 3: Pedro tenta login (10 segundos depois)**

```bash
# MESMO processo
POST http://localhost:8001/recognize
Form:
  tenant_id: "banco_abc"
  image: foto_de_pedro.jpg
  candidates: [MESMO array de 20]

# ⚙️ INTERNO DA API:
# 1. Cache AINDA TEM os 20 embeddings para banco_abc
# 2. Busca no cache → encontra todos
# 3. Compara
# 4. Encontra melhor match no índice 5 (person_id: 6 = Pedro)

# Resposta
{
  "status": "identified",
  "candidate_index": 5,
  "confidence": 0.96,
  "liveness_score": 0.97,
  "processing_ms": 110  ← RÁPIDO NOVAMENTE! (mesma velocidade da req 2)
}

# Node.js: candidate_index = 5 → candidates[5].person_id = 6 → Login de Pedro ✓
```

**Resumo do Ganho de Performance:**

| Requisição | Ação                        | Tempo | Por quê                   |
| ---------- | --------------------------- | ----- | ------------------------- |
| 1 (João)   | Descriptografa 20 + Compara | 450ms | Primeira vez (cache miss) |
| 2 (Maria)  | Reutiliza cache + Compara   | 120ms | ✓ 73% mais rápido         |
| 3 (Pedro)  | Reutiliza cache + Compara   | 110ms | ✓ 76% mais rápido         |

A descriptografia (operação cara) ocorre UMA VEZ. As demais requisições apenas reutilizam.

---

## Exemplo cURL para testes rápidos

```bash
curl -X GET "http://localhost:8001/health"
```

### Reconhecer (com curl):

```bash
curl -X POST "http://localhost:8001/recognize" \
  -H "X-API-Key: <chave de api>" \
  -F "tenant_id=banco_abc" \
  -F "image=@/path/to/face.jpg" \
  -F 'candidates=[{"person_id":42,"embedding_iv":"...","embedding_tag":"...","embedding_ct":"..."},{"person_id":15,"embedding_iv":"...","embedding_tag":"...","embedding_ct":"..."}]'
```

### Registrar (com curl):

```bash
curl -X POST "http://localhost:8001/embeddings/register" \
  -H "X-API-Key: <chave de api>" \
  -F "tenant_id=customer_123" \
  -F "person_id=789" \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@image3.jpg"
```

---

## Valores Padrão (do config)

```python
RECOGNITION_THRESHOLD = 1.10      # Distância máxima para match
LIVENESS_THRESHOLD = 0.85          # Score mínimo de liveness (0-1)
PORT = 8001
```

- **Confiança** (nas respostas) = 1 - (distância / threshold)
- **Liveness score** = 0.0 (fake/spoofing) até 1.0 (rosto real)

---

## ⚙️ Detalhes Técnicos

### Como o Cache em Memória Funciona

**Cenário:** Um tenant com 20 usuários cadastrados faz reconhecimentos em lote.

```
Requisição 1: 20 candidates
├─ Descriptografa 20 embeddings (cache miss)
└─ Salva no cache: tenant_id → {person_1: embedding, person_2: embedding, ...}

Requisição 2: 20 candidates (MESMOS)
├─ Busca no cache por tenant_id/person_id
├─ Encontra 20 embeddings já descriptografados
└─ Reutiliza sem descriptografar novamente ✓ 90% mais rápido

Requisição 3: 5 candidates (subset)
├─ Busca no cache
├─ Encontra 5 embeddings
└─ Reutiliza ✓ 100% from cache
```

**Benefício:** A descriptografia é operação custosa (AES-256-GCM). Com cache por `tenant_id/person_id`, múltiplas requisições (reconhecimentos em lote, login com retry, etc) reutilizam os embeddings já descriptografados.

### Mapeamento de candidate_index → person_id

A API retorna `candidate_index` (posição no array). Quem construiu o array (Node.js) sabe mapear de volta:

```python
# Node.js construiu este array nesta ordem:
candidates = [
  {person_id: 42, embedding: {...}},  # índice 0
  {person_id: 15, embedding: {...}},  # índice 1
  {person_id: 78, embedding: {...}}   # índice 2
]

# API retorna: candidate_index: 1
# Node.js faz: person_id = candidates[1].person_id = 15
```

### Por que separar tenant_id na API?

1. **Isolamento de cache:** Cada tenant tem seu próprio cache isolado
2. **Segurança:** Embeddings de um tenant não vazam para outro
3. **Performance:** Reutilização eficiente dentro do mesmo tenant
4. **Escalabilidade:** Múltiplos workers podem ter caches diferentes

---

**API rodando? Teste agora no Postman! 🚀**
