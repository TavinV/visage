"""Configuração e fixtures compartilhadas do pytest."""

import os

import numpy as np
import pytest


# ── Embeddings sintéticos ────────────────────────────────────────────────────


def make_embedding(seed: int | None = None) -> np.ndarray:
    """Embedding ArcFace sintético: 512 dimensões, float32, normalizado L2."""
    rng = np.random.default_rng(seed)
    emb = rng.standard_normal(512).astype(np.float32)
    return (emb / np.linalg.norm(emb)).astype(np.float32)


@pytest.fixture
def sample_embedding() -> np.ndarray:
    """Um embedding normalizado L2."""
    return make_embedding()


@pytest.fixture
def sample_embeddings() -> list[np.ndarray]:
    """Cinco embeddings normalizados L2, determinísticos entre execuções."""
    return [make_embedding(seed) for seed in range(5)]


# ── Chaves de teste ──────────────────────────────────────────────────────────


@pytest.fixture
def master_key() -> bytes:
    """MASTER_KEY de 32 bytes — cifra as DEKs (envelope encryption)."""
    return os.urandom(32)


@pytest.fixture
def tenant_dek() -> bytes:
    """DEK de tenant: 32 bytes, cifra os embeddings."""
    return os.urandom(32)


# ── Ambiente da engine viva (só para os testes `integration`) ────────────────


@pytest.fixture(scope="session")
def engine_base_url() -> str:
    return os.environ.get("ENGINE_BASE_URL", "http://localhost:8001")


@pytest.fixture(scope="session")
def engine_api_key() -> str:
    """
    Chave da engine lida do ambiente — nunca versionada no fonte.
    Os testes que dependem dela pulam quando ela não está definida.
    """
    key = os.environ.get("ENGINE_API_KEY")
    if not key:
        pytest.skip("ENGINE_API_KEY não definida — teste de integração ignorado")
    return key
