"""
Comparação vetorizada de embeddings faciais.
Utiliza operações NumPy puras para distância euclidiana rápida.
"""

import numpy as np
from typing import Optional


class FaceComparator:
    """
    Comparador de embeddings faciais usando distância euclidiana vetorizada.
    ArcFace produz embeddings normalizados L2, otimizando comparação.
    """

    def __init__(self, threshold: float = 1.10):
        """
        Inicializa com threshold de distância euclidiana.

        Args:
            threshold: Distância máxima para considerar match (padrão 1.10)
        """
        self.threshold = threshold

    def compare_one_vs_many(
        self,
        query_embedding: np.ndarray,
        candidate_embeddings: dict[int, np.ndarray],
        threshold: Optional[float] = None,
    ) -> Optional[tuple[int, float, float]]:
        """
        Compara um embedding contra múltiplos candidatos vetorizadamente com threshold dinâmico.

        Como embeddings ArcFace são normalizados L2 (||e|| = 1), usa-se:
        similarity = candidate_matrix @ query_embedding
        distance = sqrt(2 * (1 - clipped_similarity))

        Args:
            query_embedding: numpy.ndarray (512,) normalizado
            candidate_embeddings: dict[person_id -> ndarray (512,)]
            threshold: Threshold de distância (usa self.threshold se None)

        Returns:
            Tupla (person_id, distance, confidence) se match encontrado,
            None caso contrário
        """
        if not candidate_embeddings:
            return None

        # Usar threshold fornecido ou o padrão da instância
        effective_threshold = threshold if threshold is not None else self.threshold

        # Montar matriz de candidatos: (N, 512)
        person_ids = list(candidate_embeddings.keys())
        candidate_matrix = np.array(
            [candidate_embeddings[pid] for pid in person_ids],
            dtype=np.float32,
        )

        # Computar similaridades: (N,)
        similarities = candidate_matrix @ query_embedding

        # Clip para [-1, 1] para evitar erros numéricos
        similarities = np.clip(similarities, -1.0, 1.0)

        # Computar distâncias euclidiana: (N,)
        distances = np.sqrt(2.0 * (1.0 - similarities))

        # Encontrar melhor match
        best_idx = np.argmin(distances)
        best_distance = float(distances[best_idx])
        best_person_id = person_ids[best_idx]

        # Verificar threshold
        if best_distance > effective_threshold:
            return None

        # Calcular confidence (0.0 a 1.0)
        confidence = max(0.0, 1.0 - (best_distance / 1.5))

        return best_person_id, best_distance, confidence

    def compute_distances(
        self,
        query_embedding: np.ndarray,
        candidate_embeddings: dict[int, np.ndarray],
    ) -> dict[int, float]:
        """
        Computa distâncias de um embedding contra múltiplos candidatos.

        Args:
            query_embedding: numpy.ndarray (512,) normalizado
            candidate_embeddings: dict[person_id -> ndarray (512,)]

        Returns:
            dict[person_id -> distância euclidiana]
        """
        if not candidate_embeddings:
            return {}

        person_ids = list(candidate_embeddings.keys())
        candidate_matrix = np.array(
            [candidate_embeddings[pid] for pid in person_ids],
            dtype=np.float32,
        )

        similarities = candidate_matrix @ query_embedding
        similarities = np.clip(similarities, -1.0, 1.0)
        distances = np.sqrt(2.0 * (1.0 - similarities))

        return {pid: float(dist) for pid, dist in zip(person_ids, distances)}
