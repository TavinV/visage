"""
Cache de DEK e de embeddings contra a engine viva.

Substitui o antigo `tests/test_cache.py`, que imprimia resultados sem nenhum
`assert` (passava mesmo com o servidor fora do ar) e trazia a API key em texto
puro no fonte. Aqui a chave vem do ambiente e toda verificação é asserção.

Requer a engine no ar (`docker compose up -d face-engine`) e `ENGINE_API_KEY`
exportada. Sem isso, os testes são pulados — nunca falsamente verdes.
"""

import os

import pytest
import requests

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def engine(engine_base_url: str, engine_api_key: str) -> dict:
    """Confirma que a engine responde antes de rodar qualquer caso."""
    try:
        response = requests.get(f"{engine_base_url}/health", timeout=5)
    except requests.RequestException as exc:
        pytest.skip(f"engine indisponível em {engine_base_url}: {exc}")

    if response.status_code != 200:
        pytest.skip(f"/health respondeu {response.status_code}")

    return {
        "base_url": engine_base_url,
        "headers": {"X-API-Key": engine_api_key},
    }


def test_health_reporta_modelos_carregados(engine: dict) -> None:
    response = requests.get(f"{engine['base_url']}/health", timeout=5)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    # O detector e o embedder são obrigatórios para qualquer reconhecimento
    assert body["models"]["detector"] is True
    assert body["models"]["embedder"] is True


def test_rota_protegida_exige_api_key(engine: dict) -> None:
    """Sem X-API-Key, nenhuma rota de negócio responde."""
    response = requests.delete(
        f"{engine['base_url']}/cache/dek/tenant-inexistente", timeout=5
    )

    assert response.status_code == 401


def test_api_key_errada_e_rejeitada(engine: dict) -> None:
    response = requests.delete(
        f"{engine['base_url']}/cache/dek/tenant-inexistente",
        headers={"X-API-Key": "chave-errada"},
        timeout=5,
    )

    assert response.status_code == 401


def test_invalidar_dek_de_tenant_sem_cache_nao_estoura(engine: dict) -> None:
    """
    Invalidar a DEK de um tenant que nunca foi aquecido é uma operação normal
    (o backend chama isso ao rotacionar chave), não um erro.
    """
    response = requests.delete(
        f"{engine['base_url']}/cache/dek/tenant-nunca-visto",
        headers=engine["headers"],
        timeout=5,
    )

    assert response.status_code == 200
    assert "invalidated" in response.json()


@pytest.mark.skipif(
    not os.environ.get("ENGINE_WARM_FIXTURE"),
    reason="exige fixture de candidatos cifrados com uma DEK real (ENGINE_WARM_FIXTURE)",
)
def test_warm_cache_popula_e_acelera_reconhecimento(engine: dict) -> None:
    """
    O ganho do cache só é mensurável com candidatos cifrados de verdade: com
    payload fictício a engine falha antes de decifrar e o tempo não diz nada
    — foi exatamente o que o teste antigo mediu e reportou como sucesso.
    """
    pytest.fail("fixture de warm cache ainda não montada (ver .claude/testing.md, Fase 3)")
