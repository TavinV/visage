---
description: "Use quando criar ou editar endpoints FastAPI, serviços de reconhecimento, criptografia AES-GCM ou qualquer código da face engine VisageX. Cobre envelope encryption com DEK/MASTER_KEY, pipeline de reconhecimento, Pydantic schemas e tratamento de InvalidTag."
applyTo: "face_engine/**"
---

# Face Engine — FastAPI + Python 3.11

## Estrutura de pastas

```
face_engine/app/
  api/routes/    — endpoints FastAPI (recognize.py, embeddings.py, calibrate.py)
  core/          — config.py, security.py, logging.py
  engine/        — detector.py, embedder.py, comparator.py, liveness.py
  services/      — recognition_service.py, embedding_service.py, cache_service.py
  infra/         — cache_memory.py (cache DEK + embeddings), file_storage.py
  utils/         — crypto.py, image.py, math.py
```

## Criptografia — regras invioláveis

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

# IV: sempre novo por operação
iv = os.urandom(12)  # 12 bytes — nunca reutilizar

# Decifrar DEK com MASTER_KEY
def decrypt_dek(master_key_hex: str, dek_ct: bytes, dek_iv: bytes, dek_tag: bytes) -> bytes:
    master_key = bytes.fromhex(master_key_hex)
    aesgcm = AESGCM(master_key)
    # NUNCA capturar InvalidTag silenciosamente
    return aesgcm.decrypt(dek_iv, dek_ct + dek_tag, None)

# Cifrar embedding com DEK do tenant
def encrypt_embedding(dek: bytes, plaintext: bytes) -> tuple[bytes, bytes, bytes]:
    iv = os.urandom(12)
    aesgcm = AESGCM(dek)
    ct_with_tag = aesgcm.encrypt(iv, plaintext, None)
    ct, tag = ct_with_tag[:-16], ct_with_tag[-16:]
    return iv, tag, ct
```

**`InvalidTag` nunca deve ser capturado — deve propagar como HTTP 422 ou 500.**

## Cache de DEK por tenant

```python
from dataclasses import dataclass
from datetime import datetime, timedelta

@dataclass
class CachedDek:
    key: bytes
    expires_at: datetime

_dek_cache: dict[str, CachedDek] = {}  # tenant_id → CachedDek
DEK_TTL_HOURS = 1

def get_or_cache_dek(tenant_id: str, encrypted_dek: EncryptedDek) -> bytes:
    cached = _dek_cache.get(tenant_id)
    if cached and cached.expires_at > datetime.utcnow():
        return cached.key
    dek = decrypt_dek(settings.MASTER_KEY, ...)
    _dek_cache[tenant_id] = CachedDek(key=dek, expires_at=datetime.utcnow() + timedelta(hours=DEK_TTL_HOURS))
    return dek
```

## Schemas Pydantic

```python
from pydantic import BaseModel

class EncryptedDek(BaseModel):
    dek_ct: str   # hex
    dek_iv: str   # hex
    dek_tag: str  # hex
    key_version: int

class EmbeddingCandidate(BaseModel):
    person_id: int
    embedding_iv: str   # hex
    embedding_tag: str  # hex
    embedding_ct: str   # hex
    key_version: int

class RecognizeRequest(BaseModel):
    tenant_id: str
    image_b64: str
    tenant_dek: EncryptedDek
    candidates: list[EmbeddingCandidate]
```

## Autenticação de endpoints

```python
from app.core.security import verify_api_key

@router.post('/recognize')
async def recognize(request: RecognizeRequest, api_key: str = Depends(verify_api_key)):
    ...
```

## Pipeline — ordem com early exit

1. Decodificar imagem → HTTP 400 se inválida
2. Redimensionar para máx 640px
3. SCRFD detecta face → `no_face_detected` se ausente
4. MiniFASNet v1+v2 → `liveness_failed` se score < threshold
5. Análise HSV (penalidade, não bloqueia sozinha)
6. ArcFace R50 extrai embedding 512d
7. Comparação vetorizada com candidatos em cache

## Type hints obrigatórios

```python
# Sempre anotar parâmetros e retornos
def compare_embeddings(query: np.ndarray, candidates: np.ndarray) -> tuple[int, float]:
    ...
```

## A engine nunca persiste dados

Toda persistência é responsabilidade do Node. A engine apenas processa e retorna.
