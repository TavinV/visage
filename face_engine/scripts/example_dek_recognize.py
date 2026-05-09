"""
Exemplo de requisição ao engine com DEK por tenant
Demonstra fluxo completo de criptografia e reconhecimento
"""

import os
import json
import base64
import numpy as np
from datetime import datetime
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def demo_recognize_with_dek():
    """
    Demonstra como fazer requisição POST /recognize com DEK por tenant.
    
    Simula:
    1. Backend gera DEK e cifra com MASTER_KEY
    2. Backend envia EncryptedDEK para engine
    3. Engine descriptografa e recogniza
    """
    
    # Configuração
    MASTER_KEY_HEX = os.environ.get("MASTER_KEY", "6c3e8f5d2a94b7c1e5f3g2h8i4j6k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7")
    ENGINE_URL = "http://localhost:8001"
    TENANT_ID = "123"
    
    master_key = bytes.fromhex(MASTER_KEY_HEX)
    
    print("=" * 80)
    print("DEMO — Reconhecimento com DEK por Tenant")
    print("=" * 80)
    print()
    
    # ========================================================================
    # PASSO 1: Backend gera/carrega DEK (simulado)
    # ========================================================================
    print("[1] Backend — Gerar/carregar DEK do tenant")
    print("-" * 80)
    
    # Simular: DEK foi gerada durante criação do tenant
    dek = os.urandom(32)  # 256 bits
    print(f"  DEK (plaintext, 32 bytes): {dek.hex()[:32]}...")
    
    # ========================================================================
    # PASSO 2: Backend cifra DEK com MASTER_KEY
    # ========================================================================
    print()
    print("[2] Backend — Cifrar DEK com MASTER_KEY (AES-256-GCM)")
    print("-" * 80)
    
    iv_dek = os.urandom(12)  # IV para DEK
    cipher_dek = AESGCM(master_key)
    ct_with_tag = cipher_dek.encrypt(iv_dek, dek)
    dek_ct = ct_with_tag[:-16]  # ciphertext
    dek_tag = ct_with_tag[-16:]  # tag
    
    print(f"  IV (12 bytes):           {iv_dek.hex()}")
    print(f"  Ciphertext (32 bytes):   {dek_ct.hex()}")
    print(f"  Tag (16 bytes):          {dek_tag.hex()}")
    
    # ========================================================================
    # PASSO 3: Backend gera embedding dummy e cifra com DEK
    # ========================================================================
    print()
    print("[3] Backend — Gerar embedding dummy e cifrar com DEK")
    print("-" * 80)
    
    # Simular: embedding ArcFace 512d normalizado
    embedding_dummy = np.random.randn(512).astype(np.float32)
    embedding_dummy = embedding_dummy / np.linalg.norm(embedding_dummy)  # Normalizar L2
    embedding_bytes = embedding_dummy.astype(np.float32).tobytes()
    print(f"  Embedding shape: {embedding_dummy.shape}, bytes: {len(embedding_bytes)}")
    
    # Cifrar com DEK
    iv_emb = os.urandom(12)
    cipher_emb = AESGCM(dek)
    ct_emb_with_tag = cipher_emb.encrypt(iv_emb, embedding_bytes)
    emb_ct = ct_emb_with_tag[:-16]
    emb_tag = ct_emb_with_tag[-16:]
    
    print(f"  Embedding IV (12 bytes):     {iv_emb.hex()}")
    print(f"  Embedding Ciphertext (hex):  {emb_ct.hex()[:32]}...")
    print(f"  Embedding Tag (16 bytes):    {emb_tag.hex()}")
    
    # ========================================================================
    # PASSO 4: Backend prepara payload para engine
    # ========================================================================
    print()
    print("[4] Backend — Preparar payload para engine")
    print("-" * 80)
    
    payload = {
        "tenant_id": TENANT_ID,
        "tenant_dek": {
            "dek_ct": dek_ct.hex(),
            "dek_iv": iv_dek.hex(),
            "dek_tag": dek_tag.hex(),
            "key_version": 1,
        },
        "candidates": [
            {
                "person_id": 1,
                "embedding_iv": iv_emb.hex(),
                "embedding_tag": emb_tag.hex(),
                "embedding_ct": emb_ct.hex(),
                "key_version": 1,
            }
        ],
    }
    
    print(f"  Payload keys: {list(payload.keys())}")
    print(f"  Candidates: {len(payload['candidates'])}")
    print(f"  Tenant DEK versão: {payload['tenant_dek']['key_version']}")
    
    # ========================================================================
    # PASSO 5: Backend envia para engine (simulado)
    # ========================================================================
    print()
    print("[5] Backend → Engine — Enviar requisição")
    print("-" * 80)
    print(f"  POST {ENGINE_URL}/recognize")
    print(f"  Payload size: {len(json.dumps(payload))} bytes")
    print()
    print("  CURL command:")
    print(f"""
    curl -X POST {ENGINE_URL}/recognize \\
      -F 'tenant_id={TENANT_ID}' \\
      -F 'tenant_dek={json.dumps(payload["tenant_dek"])}' \\
      -F 'candidates={json.dumps(payload["candidates"])}' \\
      -F 'image=@/path/to/image.jpg'
    """)
    
    # ========================================================================
    # PASSO 6: Engine descriptografa DEK
    # ========================================================================
    print()
    print("[6] Engine — Descriptografar DEK com MASTER_KEY")
    print("-" * 80)
    print(f"  MASTER_KEY (conhecida): {MASTER_KEY_HEX[:32]}...")
    print(f"  Recebido DEK cifrada (hex): {payload['tenant_dek']['dek_ct'][:32]}...")
    
    # Simular descriptografia
    cipher_verify = AESGCM(master_key)
    ct_with_tag_verify = bytes.fromhex(payload['tenant_dek']['dek_ct']) + bytes.fromhex(payload['tenant_dek']['dek_tag'])
    dek_decrypted = cipher_verify.decrypt(
        bytes.fromhex(payload['tenant_dek']['dek_iv']),
        ct_with_tag_verify,
        None
    )
    
    assert dek_decrypted == dek, "DEK não bate!"
    print(f"  ✓ DEK descriptografada corretamente: {dek_decrypted.hex()[:32]}...")
    
    # ========================================================================
    # PASSO 7: Engine descriptografa embedding com DEK
    # ========================================================================
    print()
    print("[7] Engine — Descriptografar embedding com DEK")
    print("-" * 80)
    
    # Simular descriptografia
    cipher_emb_verify = AESGCM(dek_decrypted)
    ct_with_tag_emb = bytes.fromhex(payload['candidates'][0]['embedding_ct']) + bytes.fromhex(payload['candidates'][0]['embedding_tag'])
    embedding_decrypted_bytes = cipher_emb_verify.decrypt(
        bytes.fromhex(payload['candidates'][0]['embedding_iv']),
        ct_with_tag_emb,
        None
    )
    embedding_decrypted = np.frombuffer(embedding_decrypted_bytes, dtype=np.float32)
    
    # Verificar que é igual
    diff = np.linalg.norm(embedding_dummy - embedding_decrypted)
    print(f"  Embedding descriptografado shape: {embedding_decrypted.shape}")
    print(f"  Diferença com original: {diff:.2e}")
    if diff < 1e-6:
        print(f"  ✓ Embedding descriptografado corretamente")
    
    # ========================================================================
    # RESUMO
    # ========================================================================
    print()
    print("=" * 80)
    print("RESUMO — Fluxo de Criptografia com DEK por Tenant")
    print("=" * 80)
    print("""
    1. Backend carrega DEK do postgres (cifrada em tenant_keys)
    2. Backend cifra DEK com MASTER_KEY → EncryptedDEK
    3. Backend envia EncryptedDEK + candidatos para engine
    4. Engine descriptografa DEK com MASTER_KEY
    5. Engine cacheia DEK por 1h
    6. Engine descriptografa embeddings com DEK
    7. Engine compara com query embedding
    
    Cada tenant tem sua própria DEK → isolamento total
    Engine nunca persiste DEK → apenas em RAM
    Cache reduz custo de descriptografia em requisições seguintes
    """)


if __name__ == "__main__":
    demo_recognize_with_dek()
