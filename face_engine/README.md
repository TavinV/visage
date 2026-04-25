# Face Recognition Engine - MVP

Motor de reconhecimento facial com anti-spoofing (liveness detection) em Python com FastAPI.

## Overview

A Face Recognition Engine é um serviço interno chamado exclusivamente pelo backend Node.js. Implementa reconhecimento facial com:

- **Detector**: SCRFD via InsightFace (detecção + alinhamento)
- **Embedder**: ArcFace R50 (embedding 512D normalizado)
- **Anti-spoofing**: MiniFASNet via ONNX (detecção de apresentação)
- **Criptografia**: AES-256-GCM para embeddings em repouso
- **Cache**: Memória thread-safe (sem Redis no MVP)

## Stack

- Python 3.11+
- FastAPI + Uvicorn (workers=1)
- InsightFace (buffalo_s)
- OpenCV (cv2)
- cryptography (AESGCM)
- NumPy
- onnxruntime
- pydantic2

## Instalação

### 1. Preparar Ambiente

```bash
cd face_engine
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

### 2. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 3. Configurar Variáveis de Ambiente

Copiar `.env.example` para `.env` e preencher valores:

```bash
cp .env.example .env
```

Gerar chave AES-256 (64 caracteres hex = 256 bits):

```python
import os
key = os.urandom(32).hex()
print(key)  # Copiar para AES_KEY no .env
```

Exemplo de `.env`:

```env
# Chave AES-256 em hexadecimal (64 caracteres)
AES_KEY=5f7c3e9b2a8d6f1c4e7a9d2b5f8c1e4a7d0c3b6e9f2a5c8d1e4f7a0b3c6d9f

# API Key para autenticação do Node.js
ENGINE_API_KEY=sk-face-engine-secret-key-1234567890

# Threshold de distância euclidiana para reconhecimento
RECOGNITION_THRESHOLD=1.10

# Threshold de liveness (0.0 a 1.0)
LIVENESS_THRESHOLD=0.85

# Caminho do modelo de liveness ONNX
LIVENESS_MODEL_PATH=./models/minifas.onnx

# Porta da engine
PORT=8001
```

### 4. Baixar Modelo de Liveness

O modelo MiniFASNet ONNX é necessário para anti-spoofing:

```bash
mkdir -p models
# Baixar minifas.onnx e salvar em ./models/
wget https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/model/anti_spoof_models/onnx/minifasnet.onnx -O models/minifas.onnx
```

## Execução

### Modo Desenvolvimento

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Modo Produção

```bash
# IMPORTANTE: workers=1 garante cache em memória compartilhado
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
```

A API estará disponível em `http://localhost:8001`

Documentação interativa: `http://localhost:8001/docs`

## API Endpoints

### 1. GET /health

Verifica status dos modelos carregados.

**Request:**

```bash
curl -X GET http://localhost:8001/health \
  -H "X-API-Key: sk-face-engine-secret-key-1234567890"
```

**Response:**

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

### 2. POST /recognize

Reconhece face em imagem contra candidatos pré-filtrados.

**Request:**

```bash
curl -X POST http://localhost:8001/recognize \
  -H "X-API-Key: sk-face-engine-secret-key-1234567890" \
  -F "tenant_id=tenant-123" \
  -F "image=@face.jpg" \
  -F 'candidates=[
    {
      "person_id": 1,
      "embedding_iv": "a1b2c3d4e5f6g7h8i9j0",
      "embedding_tag": "k1l2m3n4o5p6q7r8s9t0",
      "embedding_ct": "u1v2w3x4y5z6a1b2c3d4e5f6..."
    }
  ]'
```

**Response (Sucesso):**

```json
{
  "status": "identified",
  "person_id": 1,
  "confidence": 0.87,
  "liveness_score": 0.94,
  "processing_ms": 183
}
```

**Response (Falha):**

```json
{
  "status": "not_identified",
  "processing_ms": 95
}
```

**Possíveis Status:**

- `identified`: Face identificada com sucesso
- `not_identified`: Nenhum candidato acima do threshold
- `liveness_failed`: Face não passou em anti-spoofing
- `no_face_detected`: Nenhuma face detectada na imagem

### 3. POST /embeddings/register

Registra novo embedding para uma pessoa usando **múltiplas imagens** (até 5).

Recebe múltiplas imagens, extrai embedding de cada uma, calcula a **média** e retorna criptografado.

**Request:**

```bash
curl -X POST http://localhost:8001/embeddings/register \
  -H "X-API-Key: sk-face-engine-secret-key-1234567890" \
  -F "tenant_id=tenant-123" \
  -F "person_id=42" \
  -F "files=@face1.jpg" \
  -F "files=@face2.jpg" \
  -F "files=@face3.jpg" \
  -F "files=@face4.jpg" \
  -F "files=@face5.jpg"
```

**Response:**

```json
{
  "person_id": 42,
  "embedding_iv": "a1b2c3d4e5f6g7h8i9j0",
  "embedding_tag": "k1l2m3n4o5p6q7r8s9t0",
  "embedding_ct": "u1v2w3x4y5z6a1b2c3d4e5f6g7h8i9j0k1l2m3n4...",
  "model_version": "arcface_r50_v1",
  "images_processed": 5
}
```

**Comportamento:**

- Processa cada imagem independentemente
- Detecta face em cada imagem
- Ignora imagens sem face detectada (continua com próximas)
- Calcula embedding para cada face detectada
- **Média dos embeddings:** `mean = (e1 + e2 + ... + eN) / N`
- **Renormaliza** em L2 após calcular média: `mean = mean / ||mean||`
- Criptografa e retorna embedding médio
- Campo `images_processed` indica quantas imagens foram processadas com sucesso

**Requisitos:**

- Mínimo: 1 imagem com face detectada
- Máximo: 5 imagens
- Erro se nenhuma face for detectada em nenhuma imagem

### 4. DELETE /embeddings/{tenant_id}/{person_id}

Invalida embedding em cache (chamado quando usuário é removido).

**Request:**

```bash
curl -X DELETE http://localhost:8001/embeddings/tenant-123/42 \
  -H "X-API-Key: sk-face-engine-secret-key-1234567890"
```

**Response:**

```json
{
  "invalidated": true
}
```

## Detalhes Técnicos

### Serialização de Embeddings

Embeddings são numpy arrays `float32` de shape `(512,)` = 2048 bytes binários (sem base64):

```python
# Serializar
embedding_bytes = embedding.astype(np.float32).tobytes()  # 2048 bytes

# Desserializar
embedding = np.frombuffer(embedding_bytes, dtype=np.float32).copy()
```

### Criptografia AES-256-GCM

- **IV**: 12 bytes aleatórios por operação (nunca reutilizar)
- **Chave**: 32 bytes (256 bits) carregada do ambiente como hex
- **Tag**: 16 bytes de autenticação GCM (verifica integridade)
- **Resultado**: IV + Tag + Ciphertext armazenados separadamente

```python
from core.crypto import EmbeddingCrypto

crypto = EmbeddingCrypto("5f7c3e9b2a8d6f1c4e7a9d2b5f8c1e4a7d0c3b6e9f2a5c8d1e4f7a0b3c6d9f")

# Criptografar
iv, tag, ciphertext = crypto.encrypt_embedding(embedding)

# Descriptografar
embedding = crypto.decrypt_embedding(iv, tag, ciphertext)
```

### Pipeline de Reconhecimento

1. **Decodificação**: OpenCV `cv2.imdecode()` → retorna HTTP 400 se inválida
2. **Detecção**: SCRFD via InsightFace → retorna `no_face_detected` se ausente
3. **Anti-spoofing**: MiniFASNet → retorna `liveness_failed` se score < threshold
4. **Embedding**: ArcFace R50 → ndarray `(512,)` normalizado L2
5. **Resolução**: Busca cache → descriptografa ausentes → insere em cache
6. **Comparação**: Operações NumPy vetorizadas

### Comparação Vetorizada

Com embeddings normalizados L2:

```python
# Similaridade coseno
similarities = candidate_matrix @ query_embedding  # (N,)

# Distância euclidiana
distances = np.sqrt(2 * (1 - np.clip(similarities, -1, 1)))  # (N,)

# Confidence score
confidence = max(0.0, 1.0 - (best_distance / 1.5))
```

### Cache em Memória

Thread-safe com `threading.RLock()`:

```python
from cache.memory_cache import MemoryEmbeddingCache

cache = MemoryEmbeddingCache()

# Armazenar
cache.set("tenant-123", 42, embedding_array)

# Recuperar
embedding = cache.get("tenant-123", 42)

# Recuperar múltiplos
embeddings = cache.get_many("tenant-123", [1, 2, 3])

# Invalidar
cache.invalidate("tenant-123", 42)
cache.invalidate_tenant("tenant-123")
```

## Autenticação

Todas as rotas requerem header `X-API-Key`:

```bash
curl -H "X-API-Key: sk-face-engine-secret-key-1234567890" ...
```

Retorna HTTP 401 se ausente ou inválida.

## Processamento Latência

Tempo total incluindo todas as etapas (em `processing_ms`):

- Decodificação: ~5-10ms
- Detecção + alinhamento: ~20-30ms
- Anti-spoofing: ~10-15ms
- Embedding: ~15-25ms
- Comparação vetorizada: ~1-5ms

**Total típico**: 50-100ms por requisição (CPU)

## Casos de Borde

### Candidates Vazio

Retorna `not_identified` sem processar embedding de query.

### Imagem Inválida

HTTP 400 com mensagem clara.

### Dados Adulterados (InvalidTag)

HTTP 422 com detalhe explicativo.

### Múltiplos Workers

**NÃO SUPORTADO** — quebra cache em memória local. Usar sempre `workers=1`.

## Estrutura de Diretórios

```
face_engine/
├── main.py                    # Aplicação principal + lifespan
├── config.py                  # Configuração centralizada
├── requirements.txt
├── .env.example
├── core/
│   ├── __init__.py
│   ├── crypto.py              # AES-256-GCM
│   ├── detector.py            # SCRFD + alinhamento
│   ├── embedder.py            # ArcFace R50
│   ├── liveness.py            # MiniFASNet
│   └── comparator.py          # Distância euclidiana vetorizada
├── cache/
│   ├── __init__.py
│   └── memory_cache.py        # Cache thread-safe
├── middleware/
│   ├── __init__.py
│   └── auth.py                # Validação X-API-Key
├── routers/
│   ├── __init__.py
│   ├── recognize.py           # POST /recognize
│   └── embeddings.py          # POST /register, DELETE
└── models/
    └── minifas.onnx           # Modelo de liveness (baixar)
```

## O Que NÃO Está Implementado (MVP)

- Redis ou cache externo
- BullMQ ou filas
- Multi-tenancy com schemas separados
- TTL no cache
- Rate limiting
- Logging estruturado
- Múltiplos workers

## Notas Importantes

1. **workers=1 é OBRIGATÓRIO**: Cada worker tem sua própria memória. Cache em processo compartilhado quebra com múltiplos workers.

2. **InvalidTag não é silencioso**: Se dados criptografados forem adulterados, exception propaga como HTTP 422. Isso é proposital para detectar problemas.

3. **Embeddings normalizados**: ArcFace normaliza automaticamente. Não renormalizar.

4. **IV nunca é reutilizado**: Cada criptografia gera novo IV aleatório.

5. **Sem banco de dados**: Engine é stateless. Todos os dados de pessoa vêm do Node.js.

## Licença

Proprietário SmartFace © 2025
