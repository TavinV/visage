"""
Gera 40 candidates com embeddings criptografados para teste de /recognize.
Simula 40 usuários diferentes do mesmo tenant.
"""

import json
import numpy as np
from core.crypto import EmbeddingCrypto
from config import settings


def generate_random_embedding() -> np.ndarray:
    """Gera embedding aleatório normalizado em L2 (shape 512,)."""
    embedding = np.random.randn(512).astype(np.float32)
    # Normalizar L2
    norm = np.linalg.norm(embedding)
    embedding = embedding / norm
    return embedding


def main():
    """Gera 40 candidates criptografados com person_ids 1-40."""
    
    print("=" * 70)
    print("GERADOR DE CANDIDATES PARA TESTE DE /recognize")
    print("=" * 70)
    
    crypto = EmbeddingCrypto(settings.aes_key)
    candidates = []
    
    print(f"\n✓ Chave AES: {settings.aes_key[:16]}... (primeiros 16 chars)")
    print(f"✓ Gerando 40 embeddings aleatórios normalizados...")
    
    for person_id in range(1, 41):
        # Gerar embedding aleatório
        embedding = generate_random_embedding()
        
        # Criptografar
        iv, tag, ciphertext = crypto.encrypt_embedding(embedding)
        
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
    
    print("""
---END JSON---

Configuração no Postman:
┌─────────────────────────────────────────────┐
│ POST http://localhost:8001/recognize        │
│                                             │
│ Headers:                                    │
│   X-API-Key: <sua-api-key>                  │
│   Content-Type: multipart/form-data         │
│                                             │
│ Body (form-data):                           │
│   tenant_id (Text): "banco_abc"             │
│   image (File): <selecione sua foto>        │
│   candidates (Text): [cole o JSON acima]    │
└─────────────────────────────────────────────┘

Exemplo de resposta esperada:
{
  "status": "identified",
  "candidate_index": 7,
  "confidence": 0.85,
  "liveness_score": 0.99,
  "processing_ms": 350
}

Informação importante:
- O candidate_index retornado refere-se à posição no array
  (se retornar 7, significa candidates[7] com person_id 8)
- Cache em memória: primeira requisição descriptografa,
  requisições posteriores do mesmo tenant reutilizam do cache
""")
    
    # Salvar em arquivo também
    output_file = "test_candidates_40.json"
    with open(output_file, "w") as f:
        json.dump(candidates, f, indent=2)
    
    print(f"\n✓ Arquivo salvo: {output_file}")
    print(f"  (use este arquivo se precisar carregar de novo)\n")


if __name__ == "__main__":
    main()
