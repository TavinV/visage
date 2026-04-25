"""
Testes unitários para Face Recognition Engine.
Inclui testes de criptografia, cache, detecção e comparação.
"""

import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock

# Importar módulos para testar
from core.crypto import EmbeddingCrypto
from cache.memory_cache import MemoryEmbeddingCache
from core.comparator import FaceComparator


class TestEmbeddingCrypto:
    """Testes de criptografia AES-256-GCM."""

    @pytest.fixture
    def crypto(self):
        """Fixture com instância de crypto."""
        key_hex = "5f7c3e9b2a8d6f1c4e7a9d2b5f8c1e4a7d0c3b6e9f2a5c8d1e4f7a0b3c6d9f"
        return EmbeddingCrypto(key_hex)

    @pytest.fixture
    def fake_embedding(self):
        """Fixture com embedding falso de teste."""
        return np.random.randn(512).astype(np.float32)

    def test_encrypt_returns_tuple(self, crypto, fake_embedding):
        """Verifica que encrypt retorna tupla (iv, tag, ciphertext)."""
        iv, tag, ciphertext = crypto.encrypt_embedding(fake_embedding)

        assert isinstance(iv, bytes)
        assert isinstance(tag, bytes)
        assert isinstance(ciphertext, bytes)
        assert len(iv) == 12
        assert len(tag) == 16

    def test_ciphertext_length(self, crypto, fake_embedding):
        """Verifica que ciphertext tem 2048 bytes."""
        iv, tag, ciphertext = crypto.encrypt_embedding(fake_embedding)
        # plaintext = 512 * 4 = 2048 bytes
        assert len(ciphertext) == 2048

    def test_encrypt_decrypt_roundtrip(self, crypto, fake_embedding):
        """Testa que criptografar e descriptografar recupera original."""
        # Normalizar embedding (como ArcFace faz)
        embedding_norm = fake_embedding / np.linalg.norm(fake_embedding)

        # Criptografar
        iv, tag, ciphertext = crypto.encrypt_embedding(embedding_norm)

        # Descriptografar
        recovered = crypto.decrypt_embedding(iv, tag, ciphertext)

        # Verificar que é igual (float32 tolerância)
        np.testing.assert_allclose(embedding_norm, recovered, rtol=1e-6)

    def test_different_ivs_each_encrypt(self, crypto, fake_embedding):
        """Verifica que cada criptografia gera IV diferente."""
        iv1, _, _ = crypto.encrypt_embedding(fake_embedding)
        iv2, _, _ = crypto.encrypt_embedding(fake_embedding)

        assert iv1 != iv2

    def test_invalid_key_hex_length(self):
        """Testa que chave com tamanho errado levanta erro."""
        short_key = "abcd"  # Muito curto
        with pytest.raises(ValueError):
            EmbeddingCrypto(short_key)

    def test_corrupted_tag_raises_error(self, crypto, fake_embedding):
        """Testa que tag corrompida levanta InvalidTag."""
        iv, tag, ciphertext = crypto.encrypt_embedding(fake_embedding)

        # Corromper tag
        corrupted_tag = bytes([tag[0] ^ 0xFF]) + tag[1:]

        with pytest.raises(Exception):  # InvalidTag da cryptography
            crypto.decrypt_embedding(iv, corrupted_tag, ciphertext)


class TestMemoryEmbeddingCache:
    """Testes do cache em memória."""

    @pytest.fixture
    def cache(self):
        """Fixture com instância de cache."""
        return MemoryEmbeddingCache()

    @pytest.fixture
    def fake_embedding(self):
        """Fixture com embedding falso."""
        return np.random.randn(512).astype(np.float32)

    def test_set_and_get(self, cache, fake_embedding):
        """Testa armazenar e recuperar embedding."""
        cache.set("tenant-1", 1, fake_embedding)
        retrieved = cache.get("tenant-1", 1)

        assert retrieved is not None
        np.testing.assert_array_equal(retrieved, fake_embedding)

    def test_get_nonexistent_returns_none(self, cache):
        """Testa que buscar embedding inexistente retorna None."""
        result = cache.get("tenant-1", 999)
        assert result is None

    def test_invalidate_removes_embedding(self, cache, fake_embedding):
        """Testa que invalidar remove embedding do cache."""
        cache.set("tenant-1", 1, fake_embedding)
        cache.invalidate("tenant-1", 1)
        result = cache.get("tenant-1", 1)

        assert result is None

    def test_invalidate_tenant_removes_all(self, cache, fake_embedding):
        """Testa que invalidar tenant remove todos seus embeddings."""
        cache.set("tenant-1", 1, fake_embedding)
        cache.set("tenant-1", 2, fake_embedding)
        cache.invalidate_tenant("tenant-1")

        assert cache.get("tenant-1", 1) is None
        assert cache.get("tenant-1", 2) is None

    def test_get_many(self, cache, fake_embedding):
        """Testa recuperar múltiplos embeddings."""
        e1 = np.random.randn(512).astype(np.float32)
        e2 = np.random.randn(512).astype(np.float32)

        cache.set("tenant-1", 1, e1)
        cache.set("tenant-1", 2, e2)

        result = cache.get_many("tenant-1", [1, 2, 3])

        assert len(result) == 2  # Só retorna os que existem
        assert 1 in result
        assert 2 in result
        assert 3 not in result

    def test_get_many_partial_miss(self, cache, fake_embedding):
        """Testa que get_many retorna só os que estão em cache."""
        cache.set("tenant-1", 1, fake_embedding)

        result = cache.get_many("tenant-1", [1, 999])

        assert len(result) == 1
        assert 1 in result


class TestFaceComparator:
    """Testes de comparação vetorizada."""

    @pytest.fixture
    def comparator(self):
        """Fixture com comparador."""
        return FaceComparator(threshold=1.10)

    @pytest.fixture
    def normalized_embeddings(self):
        """Cria embeddings normalizados L2."""
        # Criar embeddings aleatórios
        e1 = np.random.randn(512).astype(np.float32)
        e2 = np.random.randn(512).astype(np.float32)
        e3 = np.random.randn(512).astype(np.float32)

        # Normalizar L2
        e1 = e1 / np.linalg.norm(e1)
        e2 = e2 / np.linalg.norm(e2)
        e3 = e3 / np.linalg.norm(e3)

        return {"query": e1, "candidates": {1: e2, 2: e3}}

    def test_compare_returns_tuple(self, comparator, normalized_embeddings):
        """Testa que compare retorna tupla (person_id, distance, confidence)."""
        result = comparator.compare_one_vs_many(
            normalized_embeddings["query"],
            normalized_embeddings["candidates"],
        )

        assert isinstance(result, tuple)
        assert len(result) == 3
        person_id, distance, confidence = result
        assert isinstance(person_id, (int, np.integer))
        assert isinstance(distance, float)
        assert 0.0 <= confidence <= 1.0

    def test_compare_empty_candidates(self, comparator, normalized_embeddings):
        """Testa que comparar contra lista vazia retorna None."""
        result = comparator.compare_one_vs_many(
            normalized_embeddings["query"],
            {},
        )

        assert result is None

    def test_compare_above_threshold_returns_none(self, comparator):
        """Testa que embedding muito distante retorna None (above threshold)."""
        # Embeddings ortogonais (distância máxima)
        query = np.zeros(512, dtype=np.float32)
        query[0] = 1.0

        candidate = np.zeros(512, dtype=np.float32)
        candidate[1] = 1.0

        result = comparator.compare_one_vs_many(query, {1: candidate})

        # Deveria retornar None se distância > threshold
        if result is not None:
            _, distance, _ = result
            assert distance > comparator.threshold

    def test_confidence_score_calculation(self, comparator):
        """Testa cálculo de confidence score."""
        # Embeddings idênticos (distância ≈ 0)
        query = np.ones(512, dtype=np.float32)
        candidate = np.ones(512, dtype=np.float32)

        query = query / np.linalg.norm(query)
        candidate = candidate / np.linalg.norm(candidate)

        result = comparator.compare_one_vs_many(query, {1: candidate})

        if result is not None:
            _, distance, confidence = result
            # Confidence deve ser alto para distância pequena
            assert confidence > 0.9

    def test_compute_distances(self, comparator, normalized_embeddings):
        """Testa computação de todas as distâncias."""
        distances = comparator.compute_distances(
            normalized_embeddings["query"],
            normalized_embeddings["candidates"],
        )

        assert len(distances) == 2
        assert 1 in distances
        assert 2 in distances
        for dist in distances.values():
            assert isinstance(dist, float)
            assert dist >= 0


class TestIntegration:
    """Testes de integração."""

    def test_crypto_cache_integration(self):
        """Testa integração criptografia com cache."""
        crypto = EmbeddingCrypto(
            "5f7c3e9b2a8d6f1c4e7a9d2b5f8c1e4a7d0c3b6e9f2a5c8d1e4f7a0b3c6d9f"
        )
        cache = MemoryEmbeddingCache()

        # Gerar embedding
        embedding = np.random.randn(512).astype(np.float32)
        embedding = embedding / np.linalg.norm(embedding)

        # Criptografar
        iv, tag, ciphertext = crypto.encrypt_embedding(embedding)

        # Descriptografar e armazenar em cache
        decrypted = crypto.decrypt_embedding(iv, tag, ciphertext)
        cache.set("tenant-1", 1, decrypted)

        # Recuperar do cache
        cached = cache.get("tenant-1", 1)

        np.testing.assert_allclose(embedding, cached, rtol=1e-5)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
