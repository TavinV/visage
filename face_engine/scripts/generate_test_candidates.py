"""
Gera 40 candidates com embeddings criptografados para teste de /recognize.
Simula 40 usuários diferentes do mesmo tenant, com uma DEK de tenant simulada
(cifrada com a MASTER_KEY), no formato exigido pelo fluxo DEK-per-tenant.
"""

import json
import os

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encrypt_embedding(key: bytes, embedding: np.ndarray) -> tuple[bytes, bytes, bytes]:
    """Cifra um embedding (512 floats) com AES-256-GCM, espelhando EmbeddingCrypto."""
    plaintext = embedding.astype(np.float32).tobytes()
    iv = os.urandom(12)
    ciphertext_with_tag = AESGCM(key).encrypt(iv, plaintext, None)
    return iv, ciphertext_with_tag[-16:], ciphertext_with_tag[:-16]


def generate_random_embedding() -> np.ndarray:
    """Gera embedding aleatório normalizado em L2 (shape 512,)."""
    embedding = np.random.randn(512).astype(np.float32)
    # Normalizar L2
    norm = np.linalg.norm(embedding)
    embedding = embedding / norm
    return embedding


def main():
    """Gera 40 candidates criptografados com person_ids 1-40, usando uma DEK simulada."""

    print("=" * 70)
    print("GERADOR DE CANDIDATES PARA TESTE DE /recognize")
    print("=" * 70)

    # Simula a DEK do tenant (gerada e cifrada como o backend Node faria)
    master_key_hex = os.environ.get(
        "MASTER_KEY", "6c3e8f5d2a94b7c1e5f3g2h8i4j6k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7"
    )
    master_key = bytes.fromhex(master_key_hex)
    tenant_dek = os.urandom(32)
    dek_iv = os.urandom(12)
    dek_ct_with_tag = AESGCM(master_key).encrypt(dek_iv, tenant_dek, None)
    dek_ct, dek_tag = dek_ct_with_tag[:-16], dek_ct_with_tag[-16:]

    candidates = []

    print(f"\n✓ DEK do tenant (simulada): {tenant_dek.hex()[:16]}... (primeiros 16 chars)")
    print(f"✓ Gerando 40 embeddings aleatórios normalizados...")

    for person_id in range(1, 41):
        # Gerar embedding aleatório
        embedding = generate_random_embedding()

        # Criptografar
        iv, tag, ciphertext = encrypt_embedding(tenant_dek, embedding)

        # Adicionar ao array
        candidate = {
            "person_id": person_id,
            "embedding_iv": iv.hex(),
            "embedding_tag": tag.hex(),
            "embedding_ct": ciphertext.hex(),
        }
        candidates.append(candidate)

        if person_id % 10 == 0:
            print(f"  [{person_id:2d}/40] ✓ person_id={person_id} criptografado")

    # Montar JSON
    candidates_json = json.dumps(candidates, indent=2)

    print(f"\n✓ {len(candidates)} candidates gerados com sucesso!")
    print("\n" + "=" * 70)
    print("BODY PARA POSTMAN - POST /recognize")
    print("=" * 70)

    print("""
Copie o JSON abaixo como valor do campo 'candidates' no Postman:
(As aspas externas são apenas para mostrar o delimitador)

---BEGIN JSON---
""")

    print(candidates_json)

    print(f"""
---END JSON---

Configuração no Postman:
┌─────────────────────────────────────────────────────────┐
│ POST http://localhost:8001/recognize                    │
│                                                          │
│ Headers:                                                │
│   X-API-Key: <sua-api-key>                              │
│   Content-Type: multipart/form-data                     │
│                                                          │
│ Body (form-data):                                       │
│   tenant_id (Text): "banco_abc"                         │
│   image (File): <selecione sua foto>                    │
│   candidates (Text): [cole o JSON acima]                │
│   dek_ct (Text): {dek_ct.hex()}
│   dek_iv (Text): {dek_iv.hex()}
│   dek_tag (Text): {dek_tag.hex()}
│   dek_key_version (Text): "1"                           │
└─────────────────────────────────────────────────────────┘

Exemplo de resposta esperada:
{{
  "status": "identified",
  "person_id": 8,
  "confidence": 0.85,
  "liveness_combined_raw": 0.99,
  "processing_ms": 350
}}

Informação importante:
- dek_ct/dek_iv/dek_tag simulam a DEK do tenant cifrada com a MASTER_KEY,
  exatamente como o backend Node enviaria (envelope encryption).
- Cache em memória: a primeira requisição descriptografa a DEK e os
  embeddings; requisições seguintes do mesmo tenant reutilizam o cache
  (não é necessário reenviar dek_ct/dek_iv/dek_tag enquanto o TTL não expirar).
""")

    # Salvar em arquivo também
    output_file = "test_candidates_40.json"
    with open(output_file, "w") as f:
        json.dump(candidates, f, indent=2)

    print(f"\n✓ Arquivo salvo: {output_file}")
    print(f"  (use este arquivo se precisar carregar de novo)\n")


if __name__ == "__main__":
    main()
