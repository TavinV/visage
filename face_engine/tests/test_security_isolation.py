"""
Testes críticos de segurança — isolamento criptográfico multi-tenant.

Cobrem (ver ROADMAP.md seção 7.2):
  - Embedding cifrado com DEK do tenant A NÃO decifra com DEK do tenant B
    (InvalidTag — nunca um "identified" incorreto).
  - InvalidTag ao adulterar ciphertext/tag nunca é silenciado.
  - Consistência matemática do enroll/finalize (média vetorial + L2).
  - Expiração e invalidação do cache de DEK.

Nenhum modelo ONNX/InsightFace é necessário — apenas numpy + cryptography.
"""

import os

import numpy as np
import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.utils.crypto import EmbeddingCrypto
from app.services.dek_manager import DEKManager, CachedDEK


def _random_embedding() -> np.ndarray:
    emb = np.random.randn(512).astype(np.float32)
    return emb / np.linalg.norm(emb)


def _encrypt_dek(master_key: bytes, dek: bytes) -> tuple[bytes, bytes, bytes]:
    """Simula o Node.js cifrando a DEK com a MASTER_KEY (envelope encryption)."""
    iv = os.urandom(12)
    ct_with_tag = AESGCM(master_key).encrypt(iv, dek, None)
    return iv, ct_with_tag[:-16], ct_with_tag[-16:]  # iv, ct, tag


class TestCrossTenantIsolation:
    """Embedding do tenant A jamais pode ser lido com a DEK do tenant B."""

    def test_embedding_encrypted_with_dek_a_fails_with_dek_b(self):
        dek_a = os.urandom(32)
        dek_b = os.urandom(32)
        crypto_a = EmbeddingCrypto(dek_a.hex())
        crypto_b = EmbeddingCrypto(dek_b.hex())

        embedding = _random_embedding()
        iv, tag, ct = crypto_a.encrypt_embedding(embedding)

        # Decifrar com a DEK errada DEVE lançar InvalidTag — nunca retornar
        # um embedding (que poderia gerar um "identified" incorreto)
        with pytest.raises(InvalidTag):
            crypto_b.decrypt_embedding(iv, tag, ct)

    def test_embedding_roundtrip_with_correct_dek(self):
        dek = os.urandom(32)
        crypto = EmbeddingCrypto(dek.hex())
        embedding = _random_embedding()

        iv, tag, ct = crypto.encrypt_embedding(embedding)
        recovered = crypto.decrypt_embedding(iv, tag, ct)

        np.testing.assert_array_almost_equal(embedding, recovered, decimal=6)

    def test_dek_of_tenant_a_cannot_be_decrypted_with_wrong_master_key(self):
        master_key_real = os.urandom(32)
        master_key_wrong = os.urandom(32)
        dek = os.urandom(32)
        iv, ct, tag = _encrypt_dek(master_key_real, dek)

        manager = DEKManager(master_key_wrong.hex())
        # DEKManager envolve InvalidTag em ValueError — mas NUNCA retorna
        # uma DEK inválida silenciosamente
        with pytest.raises(ValueError):
            manager.decrypt_dek(
                tenant_id="tenant-a",
                dek_ct_hex=ct.hex(),
                dek_iv_hex=iv.hex(),
                dek_tag_hex=tag.hex(),
                key_version=1,
            )

    def test_dek_manager_isolates_cache_by_tenant(self):
        master_key = os.urandom(32)
        manager = DEKManager(master_key.hex())

        dek_a, dek_b = os.urandom(32), os.urandom(32)
        for tenant_id, dek in (("tenant-a", dek_a), ("tenant-b", dek_b)):
            iv, ct, tag = _encrypt_dek(master_key, dek)
            manager.decrypt_dek(
                tenant_id=tenant_id,
                dek_ct_hex=ct.hex(),
                dek_iv_hex=iv.hex(),
                dek_tag_hex=tag.hex(),
                key_version=1,
            )

        assert manager.get_cached_dek("tenant-a") == dek_a
        assert manager.get_cached_dek("tenant-b") == dek_b
        assert manager.get_cached_dek("tenant-a") != manager.get_cached_dek("tenant-b")


class TestInvalidTagNeverSilenced:
    """Tag GCM inválida (adulteração) sempre propaga exceção."""

    def test_tampered_ciphertext_raises(self):
        dek = os.urandom(32)
        crypto = EmbeddingCrypto(dek.hex())
        iv, tag, ct = crypto.encrypt_embedding(_random_embedding())

        tampered_ct = bytearray(ct)
        tampered_ct[0] ^= 0xFF  # flip de 1 byte

        with pytest.raises(InvalidTag):
            crypto.decrypt_embedding(iv, tag, bytes(tampered_ct))

    def test_tampered_tag_raises(self):
        dek = os.urandom(32)
        crypto = EmbeddingCrypto(dek.hex())
        iv, tag, ct = crypto.encrypt_embedding(_random_embedding())

        tampered_tag = bytearray(tag)
        tampered_tag[-1] ^= 0x01

        with pytest.raises(InvalidTag):
            crypto.decrypt_embedding(iv, bytes(tampered_tag), ct)

    def test_unique_iv_per_operation(self):
        dek = os.urandom(32)
        crypto = EmbeddingCrypto(dek.hex())
        embedding = _random_embedding()

        ivs = {crypto.encrypt_embedding(embedding)[0] for _ in range(50)}
        assert len(ivs) == 50, "IV deve ser único por operação — reutilização quebra o GCM"


class TestEnrollFinalizeMath:
    """Média vetorial + renormalização L2 do /enroll/finalize."""

    @staticmethod
    def _finalize(embeddings: list[np.ndarray]) -> np.ndarray:
        """Reproduz exatamente a lógica de enroll_finalize (enroll.py)."""
        mean = np.mean(np.array(embeddings, dtype=np.float32), axis=0).astype(np.float32)
        norm = np.linalg.norm(mean)
        if norm > 0:
            mean = mean / norm
        return mean

    def test_mean_is_l2_normalized(self):
        embeddings = [_random_embedding() for _ in range(3)]
        result = self._finalize(embeddings)
        assert result.shape == (512,)
        assert result.dtype == np.float32
        np.testing.assert_almost_equal(np.linalg.norm(result), 1.0, decimal=5)

    def test_mean_of_similar_frames_stays_close_to_source(self):
        # Frames do mesmo rosto = base + ruído pequeno; a média consolidada
        # deve permanecer muito próxima (cos sim alta) do embedding real
        base = _random_embedding()
        frames = []
        for _ in range(3):
            noisy = base + np.random.randn(512).astype(np.float32) * 0.01
            frames.append(noisy / np.linalg.norm(noisy))

        result = self._finalize(frames)
        cosine_sim = float(result @ base)
        assert cosine_sim > 0.99

    def test_finalize_roundtrip_encrypted(self):
        # Fluxo completo: N frames cifrados → decifra → média → recifra → decifra
        dek = os.urandom(32)
        crypto = EmbeddingCrypto(dek.hex())
        frames_plain = [_random_embedding() for _ in range(3)]
        frames_enc = [crypto.encrypt_embedding(e) for e in frames_plain]

        decrypted = [crypto.decrypt_embedding(iv, tag, ct) for iv, tag, ct in frames_enc]
        consolidated = self._finalize(decrypted)

        iv, tag, ct = crypto.encrypt_embedding(consolidated)
        recovered = crypto.decrypt_embedding(iv, tag, ct)
        np.testing.assert_array_almost_equal(consolidated, recovered, decimal=6)


class TestDekCacheLifecycle:
    """Expiração (TTL) e invalidação manual do cache de DEK."""

    def test_expired_dek_is_evicted(self):
        master_key = os.urandom(32)
        manager = DEKManager(master_key.hex())

        # Injeta uma DEK já expirada (TTL negativo)
        manager._dek_cache["tenant-x"] = CachedDEK(os.urandom(32), ttl_hours=-1)

        assert manager.get_cached_dek("tenant-x") is None
        assert "tenant-x" not in manager._dek_cache  # evicted no acesso

    def test_invalidate_tenant_dek(self):
        master_key = os.urandom(32)
        manager = DEKManager(master_key.hex())
        dek = os.urandom(32)
        iv, ct, tag = _encrypt_dek(master_key, dek)

        manager.decrypt_dek(
            tenant_id="tenant-y",
            dek_ct_hex=ct.hex(),
            dek_iv_hex=iv.hex(),
            dek_tag_hex=tag.hex(),
            key_version=1,
        )
        assert manager.get_cached_dek("tenant-y") == dek

        # DELETE /cache/dek/{tenant_id} chama exatamente este método
        manager.invalidate_tenant_dek("tenant-y")
        assert manager.get_cached_dek("tenant-y") is None
