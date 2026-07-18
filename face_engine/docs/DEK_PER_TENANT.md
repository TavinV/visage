# Face Engine — DEK Per Tenant Architecture

> Actualização: Suporte a DEK (Data Encryption Key) por tenant com envelope encryption

## Visão Geral

O face engine foi atualizado para suportar **diferentes chaves de criptografia por tenant**. Cada tenant tem sua própria DEK (armazenada cifrada em `tenant_keys`) que é recebida como `EncryptedDEK` do Node.js backend.

### Fluxo de Criptografia (Envelope Encryption)

```
Node.js Backend
  └─ Possui MASTER_KEY (variável de ambiente)
  └─ Carrega DEK_cifrada do tenant do PostgreSQL
  └─ Envia para engine em cada requisição

Face Engine (Python)
  └─ Possui MASTER_KEY (mesma variável de ambiente)
  └─ Recebe EncryptedDEK do Node.js
  └─ Descriptografa DEK com MASTER_KEY (usando AES-256-GCM)
  └─ Cacheia DEK por 1h (TTL configurável)
  └─ Usa DEK para descriptografar embeddings dos candidatos
  └─ Nunca persiste DEK — apenas em memória RAM durante TTL
```

## Variáveis de Ambiente

### Engine (.env)

```bash
# Chave mestre (MASTER_KEY) — DEVE SER IDÊNTICA ao backend
MASTER_KEY=6c3e8f5d2a94b7c1e5f3g2h8i4j6k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7

# Autenticação
ENGINE_API_KEY=your-api-key-here

# Cache TTL
DEK_CACHE_TTL_HOURS=1
```

## Estrutura de Request

### POST /recognize

Request agora recebe:

- `tenant_id` — ID do tenant
- `tenant_dek` — **EncryptedDEK** (cifrada com MASTER_KEY)
- `candidates` — Lista de embeddings criptografados (EncryptedEmbedding)
- `image` — Frame JPEG/PNG

```json
{
  "tenant_id": "123",
  "tenant_dek": {
    "dek_ct": "hex_string_ciphertext",
    "dek_iv": "hex_string_iv_12_bytes",
    "dek_tag": "hex_string_tag_16_bytes",
    "key_version": 1
  },
  "candidates": [
    {
      "person_id": 1,
      "embedding_iv": "hex_string",
      "embedding_tag": "hex_string",
      "embedding_ct": "hex_string_2048_bytes",
      "key_version": 1
    }
  ]
}
```

## Cache de DEK (DEKManager)

- **Localização**: `app/services/dek_manager.py`
- **Cache**: Em memória (dict Python + RWLock)
- **TTL**: 1h por padrão (configurável)
- **Invalidação**: Manual via `DELETE /cache/dek/{tenant_id}` do Node.js

### Fluxo do Cache

1. Primeira requisição → descriptografa DEK com MASTER_KEY → cacheia por 1h
2. Requisições seguintes do mesmo tenant → usa DEK do cache
3. Após 1h → cache expirado, próxima requisição re-descriptografa
4. Rotação de chave → Node.js chama `DELETE /cache/dek/{tenant_id}` → invalida cache

## Tratamento de InvalidTag

**CRÍTICO**: Se a tag GCM for inválida (dados adulterados):

- Raise `InvalidTag` da cryptography
- Propaga como HTTP 422 (Unprocessable Entity)
- **NUNCA** silenciar/ignorar `InvalidTag`

Isso garante que adulteração de embeddings é detectada imediatamente.

## Testes

### Teste de Descriptografia de DEK

```python
from app.services.dek_manager import DEKManager
from app.utils.crypto import EmbeddingCrypto
import os

# Simular geração de DEK
master_key_hex = os.environ["MASTER_KEY"]
dek_manager = DEKManager(master_key_hex)

# Gerar DEK e cifra-la
dek = os.urandom(32)
embedding_crypto = EmbeddingCrypto(dek.hex())

# Simular envio do Node.js
# (Node teria feito: cifra DEK com MASTER_KEY)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
iv = os.urandom(12)
cipher = AESGCM(bytes.fromhex(master_key_hex))
ct_with_tag = cipher.encrypt(iv, dek)
dek_ct = ct_with_tag[:-16]
dek_tag = ct_with_tag[-16:]

# Engine descriptografa
dek_decrypted = dek_manager.decrypt_dek(
    tenant_id="123",
    dek_ct_hex=dek_ct.hex(),
    dek_iv_hex=iv.hex(),
    dek_tag_hex=dek_tag.hex(),
    key_version=1,
)

assert dek == dek_decrypted
print("✓ DEK descriptografada corretamente")
```

## Migração de Código Antigo

### Antes (chave AES global)

```python
class EmbeddingCrypto:
    def __init__(self, aes_key_hex: str):
        self.key = bytes.fromhex(aes_key_hex)
```

### Depois (DEK por tenant)

```python
# Engine
dek_manager = DEKManager(settings.master_key)
dek_bytes = dek_manager.decrypt_dek(
    tenant_id=tenant_id,
    dek_ct_hex=encrypted_dek.dek_ct,
    dek_iv_hex=encrypted_dek.dek_iv,
    dek_tag_hex=encrypted_dek.dek_tag,
    key_version=encrypted_dek.key_version,
)
embedding_crypto = EmbeddingCrypto(dek_bytes.hex())
```

## Checklist de Implementação

- [x] `app/services/dek_manager.py` — Gerenciador de DEK com cache
- [x] `app/core/config.py` — Atualizado com MASTER_KEY
- [x] `app/api/schemas.py` — Novos schemas (EncryptedDEK, EncryptedEmbedding)
- [x] `app/main.py` — Inicializa DEKManager no startup
- [x] `app/api/routes/recognize.py` — Usar tenant_dek do request
- [x] `app/api/routes/embeddings.py` — Usar tenant_dek do request
- [ ] `app/api/routes/calibrate.py` — Usar tenant_dek do request
- [ ] Testes de invalidação de DEK (malformed hex, invalid tag, etc)
- [ ] Documentação de rotação de chave (key_version)

## Variáveis de Ambiente Exemplo

```bash
# MASTER_KEY (DEVE SER IDÊNTICA NO BACKEND E ENGINE)
MASTER_KEY=6c3e8f5d2a94b7c1e5f3g2h8i4j6k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7

# Engine
ENGINE_API_KEY=engine_secret_key_123
LIVENESS_MODEL_V1_PATH=./models/2.7_80x80_MiniFASNetV1.onnx
LIVENESS_MODEL_V2_PATH=./models/4_0_80x80_MiniFASNetV2.onnx
DEK_CACHE_TTL_HOURS=1
```

## Referências

- [Envelope Encryption Pattern](https://en.wikipedia.org/wiki/Envelope_encryption)
- [AES-256-GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [cryptography.io AESGCM](https://cryptography.io/en/latest/hazmat/primitives/ciphers/#aes)
