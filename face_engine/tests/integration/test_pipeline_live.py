"""
Exemplo de teste de integração com requisições HTTP.
Demonstra como chamar API da Face Recognition Engine.
"""

import base64
import json
import os
from pathlib import Path

import pytest
import requests

# Precisa da engine viva COM os modelos ONNX carregados e de imagens de rosto
# reais em tests/fixtures/. Fora do tier padrão — ver .claude/testing.md.
pytestmark = [pytest.mark.integration, pytest.mark.models]


BASE_URL = os.environ.get("ENGINE_BASE_URL", "http://localhost:8001")
API_KEY = os.environ.get("ENGINE_API_KEY", "")
TENANT_ID = "tenant-123"


def test_health_check():
    """Testa endpoint /health."""
    print("\n[TEST] Health Check")
    response = requests.get(
        f"{BASE_URL}/health",
        headers={"X-API-Key": API_KEY},
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200


def test_unauthorized_without_api_key():
    """Testa que requisição sem API Key retorna 401."""
    print("\n[TEST] Unauthorized (no API Key)")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    assert response.status_code == 401


def test_unauthorized_with_invalid_api_key():
    """Testa que API Key inválida retorna 401."""
    print("\n[TEST] Unauthorized (invalid API Key)")
    response = requests.get(
        f"{BASE_URL}/health",
        headers={"X-API-Key": "invalid-key"},
    )
    print(f"Status: {response.status_code}")
    assert response.status_code == 401


def test_register_embedding_with_image(image_path: str = "test_face.jpg"):
    """
    Testa registro de novo embedding.

    Args:
        image_path: Caminho para arquivo de imagem de teste
    """
    print(f"\n[TEST] Register Embedding from {image_path}")

    if not Path(image_path).exists():
        print(f"⚠️  Arquivo de teste não encontrado: {image_path}")
        print("Pulando teste de registro...")
        return None

    with open(image_path, "rb") as f:
        files = {
            "file": f,
        }
        data = {
            "tenant_id": TENANT_ID,
            "person_id": 42,
        }
        response = requests.post(
            f"{BASE_URL}/embeddings/register",
            headers={"X-API-Key": API_KEY},
            files=files,
            data=data,
        )

    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        return result
    else:
        print(f"Error: {response.text}")
        return None


def test_recognize_with_image(
    image_path: str = "test_face.jpg",
    embedding_data: dict = None,
):
    """
    Testa reconhecimento facial.

    Args:
        image_path: Caminho para arquivo de imagem de teste
        embedding_data: Dados de embedding do registro anterior
    """
    print(f"\n[TEST] Recognize from {image_path}")

    if not Path(image_path).exists():
        print(f"⚠️  Arquivo de teste não encontrado: {image_path}")
        print("Pulando teste de reconhecimento...")
        return

    if embedding_data is None:
        print("⚠️  Sem dados de embedding. Execute test_register_embedding_with_image primeiro.")
        return

    with open(image_path, "rb") as f:
        files = {
            "image": f,
        }
        data = {
            "tenant_id": TENANT_ID,
            "candidates": json.dumps(
                [
                    {
                        "person_id": embedding_data["person_id"],
                        "embedding_iv": embedding_data["embedding_iv"],
                        "embedding_tag": embedding_data["embedding_tag"],
                        "embedding_ct": embedding_data["embedding_ct"],
                    }
                ]
            ),
        }
        response = requests.post(
            f"{BASE_URL}/recognize",
            headers={"X-API-Key": API_KEY},
            files=files,
            data=data,
        )

    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")

    if response.status_code == 200:
        assert "status" in result
        assert "processing_ms" in result


def test_invalidate_embedding():
    """Testa invalidação de embedding em cache."""
    print("\n[TEST] Invalidate Embedding")
    response = requests.delete(
        f"{BASE_URL}/embeddings/{TENANT_ID}/42",
        headers={"X-API-Key": API_KEY},
    )
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    assert response.status_code == 200
    assert result["invalidated"] is True


def test_invalid_image():
    """Testa requisição com imagem inválida."""
    print("\n[TEST] Invalid Image")
    files = {
        "image": ("invalid.txt", b"not an image"),
    }
    data = {
        "tenant_id": TENANT_ID,
        "candidates": json.dumps([]),
    }
    response = requests.post(
        f"{BASE_URL}/recognize",
        headers={"X-API-Key": API_KEY},
        files=files,
        data=data,
    )
    print(f"Status: {response.status_code}")
    assert response.status_code == 400


if __name__ == "__main__":
    print("=" * 60)
    print("TESTES DE INTEGRAÇÃO - Face Recognition Engine")
    print("=" * 60)

    try:
        test_health_check()
        test_unauthorized_without_api_key()
        test_unauthorized_with_invalid_api_key()

        # Testes com imagem (se existir)
        embedding_data = test_register_embedding_with_image()
        if embedding_data:
            test_recognize_with_image(embedding_data=embedding_data)
            test_invalidate_embedding()

        test_invalid_image()

        print("\n" + "=" * 60)
        print("✓ TODOS OS TESTES PASSARAM")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n✗ TESTE FALHOU: {e}")
    except Exception as e:
        print(f"\n✗ ERRO: {e}")
