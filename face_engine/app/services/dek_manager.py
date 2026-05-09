"""
DEK (Data Encryption Key) Manager — Descriptografa e cacheia DEKs por tenant
Implementa envelope encryption com KEK (MASTER_KEY).
"""

import threading
from datetime import datetime, timedelta
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CachedDEK:
    """Representa uma DEK descriptografada cacheada com seu TTL."""

    def __init__(self, key_bytes: bytes, ttl_hours: int = 1):
        """
        Args:
            key_bytes: DEK descriptografada (32 bytes)
            ttl_hours: Time-to-live em horas
        """
        self.key = key_bytes
        self.expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)

    def is_expired(self) -> bool:
        """Verifica se cache expirou."""
        return datetime.utcnow() > self.expires_at


class DEKManager:
    """
    Gerencia criptografia e cache de DEKs por tenant.
    Descriptografa DEKs encriptadas com MASTER_KEY e cacheia em memória.
    """

    def __init__(self, master_key_hex: str, ttl_hours: int = 1):
        """
        Args:
            master_key_hex: Chave mestre em hexadecimal (64 chars = 256 bits)
            ttl_hours: TTL do cache em horas
        """
        self.master_key = bytes.fromhex(master_key_hex)
        if len(self.master_key) != 32:
            raise ValueError("MASTER_KEY deve ter 32 bytes (256 bits)")

        self.ttl_hours = ttl_hours
        self._dek_cache: dict[str, CachedDEK] = {}
        self._lock = threading.RLock()

    def decrypt_dek(
        self,
        tenant_id: str,
        dek_ct_hex: str,
        dek_iv_hex: str,
        dek_tag_hex: str,
        key_version: int,
    ) -> bytes:
        """
        Descriptografa DEK com MASTER_KEY e cacheia em memória.

        Fluxo:
        1. Verifica cache (se válido, retorna)
        2. Descriptografa DEK com MASTER_KEY
        3. Valida tag GCM
        4. Cacheia por TTL horas

        Args:
            tenant_id: ID do tenant
            dek_ct_hex: Ciphertext da DEK em hex
            dek_iv_hex: IV em hex (12 bytes)
            dek_tag_hex: Tag GCM em hex (16 bytes)
            key_version: Versão da chave (para logs)

        Returns:
            DEK descriptografada (32 bytes)

        Raises:
            ValueError: Se dados inválidos
            cryptography.hazmat.primitives.ciphers.aead.InvalidTag:
                Se tag for inválida (dados adulterados)
        """
        # Verificar cache
        with self._lock:
            if tenant_id in self._dek_cache:
                cached_dek = self._dek_cache[tenant_id]
                if not cached_dek.is_expired():
                    return cached_dek.key

        # Converter de hex para bytes
        try:
            dek_ct = bytes.fromhex(dek_ct_hex)
            dek_iv = bytes.fromhex(dek_iv_hex)
            dek_tag = bytes.fromhex(dek_tag_hex)
        except ValueError as e:
            raise ValueError(f"DEK encriptada inválida (hex inválido): {e}")

        if len(dek_iv) != 12:
            raise ValueError(f"DEK IV deve ter 12 bytes, recebido {len(dek_iv)}")
        if len(dek_tag) != 16:
            raise ValueError(f"DEK tag deve ter 16 bytes, recebido {len(dek_tag)}")

        # Descriptografar com MASTER_KEY
        cipher = AESGCM(self.master_key)
        ciphertext_with_tag = dek_ct + dek_tag

        try:
            dek_plaintext = cipher.decrypt(dek_iv, ciphertext_with_tag, None)
        except Exception as e:
            raise ValueError(f"Falha ao descriptografar DEK: {e}")

        if len(dek_plaintext) != 32:
            raise ValueError(
                f"DEK descriptografada deve ter 32 bytes, recebido {len(dek_plaintext)}"
            )

        # Cachear
        with self._lock:
            self._dek_cache[tenant_id] = CachedDEK(dek_plaintext, self.ttl_hours)

        return dek_plaintext

    def invalidate_tenant_dek(self, tenant_id: str) -> None:
        """
        Invalida DEK em cache para um tenant.
        Chamado quando há rotação de chave ou exclusão de tenant.

        Args:
            tenant_id: ID do tenant
        """
        with self._lock:
            if tenant_id in self._dek_cache:
                del self._dek_cache[tenant_id]

    def get_cached_dek(self, tenant_id: str) -> Optional[bytes]:
        """
        Retorna DEK cacheada para um tenant se existir e não tiver expirado.
        Retorna None caso contrário (precisa re-descriptografar).

        Args:
            tenant_id: ID do tenant

        Returns:
            DEK descriptografada (32 bytes) ou None
        """
        with self._lock:
            if tenant_id not in self._dek_cache:
                return None

            cached_dek = self._dek_cache[tenant_id]
            if cached_dek.is_expired():
                del self._dek_cache[tenant_id]
                return None

            return cached_dek.key
