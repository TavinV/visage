"""
Cache em memória thread-safe para embeddings já descriptografados.
Evita descriptografia redundante durante ciclo de vida do processo.
"""

import threading
import numpy as np
from typing import Optional, Dict


class MemoryEmbeddingCache:
    """
    Cache em memória thread-safe para embeddings descriptografados.

    Estrutura interna:
    _cache: dict[tenant_id -> dict[person_id -> ndarray float32 (512,)]]

    Sem TTL nessa versão — cache persiste enquanto processo viver.
    """

    def __init__(self):
        """Inicializa cache vazio com lock para thread-safety."""
        self._cache: dict[str, dict[int | str, np.ndarray]] = {}
        self._lock = threading.RLock()

    def get(self, tenant_id: str, person_id: int | str) -> Optional[np.ndarray]:
        """
        Recupera embedding do cache para um person_id em um tenant.

        Args:
            tenant_id: ID do tenant
            person_id: ID da pessoa

        Returns:
            numpy.ndarray (512,) float32 se encontrado, None caso contrário
        """
        with self._lock:
            tenant_cache = self._cache.get(tenant_id)
            if tenant_cache is None:
                return None
            return tenant_cache.get(person_id)

    def set(self, tenant_id: str, person_id: int | str, embedding: np.ndarray) -> None:
        """
        Armazena embedding no cache.

        Args:
            tenant_id: ID do tenant
            person_id: ID da pessoa
            embedding: numpy.ndarray (512,) float32
        """
        with self._lock:
            if tenant_id not in self._cache:
                self._cache[tenant_id] = {}
            self._cache[tenant_id][person_id] = embedding.copy()

    def invalidate(self, tenant_id: str, person_id: int | str) -> None:
        """
        Remove um embedding específico do cache.

        Args:
            tenant_id: ID do tenant
            person_id: ID da pessoa
        """
        with self._lock:
            tenant_cache = self._cache.get(tenant_id)
            if tenant_cache and person_id in tenant_cache:
                del tenant_cache[person_id]

    def invalidate_tenant(self, tenant_id: str) -> None:
        """
        Remove todos os embeddings de um tenant do cache.

        Args:
            tenant_id: ID do tenant
        """
        with self._lock:
            if tenant_id in self._cache:
                del self._cache[tenant_id]

    def get_many(self, tenant_id: str, person_ids: list[int | str]) -> dict[int | str, np.ndarray]:
        """
        Recupera múltiplos embeddings do cache de uma vez.

        Retorna apenas os que estão em cache, sem erro para os ausentes.

        Args:
            tenant_id: ID do tenant
            person_ids: Lista de IDs de pessoas

        Returns:
            dict[person_id -> ndarray] apenas para os encontrados
        """
        with self._lock:
            result = {}
            tenant_cache = self._cache.get(tenant_id)
            if tenant_cache is None:
                return result
            for pid in person_ids:
                if pid in tenant_cache:
                    result[pid] = tenant_cache[pid].copy()
            return result

    def get_stats(self) -> dict:
        """
        Retorna estatísticas do cache (apenas leitura).

        Returns:
            dict com informações sobre tenants e embeddings em cache
        """
        with self._lock:
            stats = {
                "total_tenants": len(self._cache),
                "total_embeddings": sum(len(v) for v in self._cache.values()),
                "tenants": {
                    tenant_id: len(embeddings)
                    for tenant_id, embeddings in self._cache.items()
                },
            }
            return stats
