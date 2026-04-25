"""
Extrator de embeddings usando ArcFace R50 via InsightFace.
Retorna embeddings normalizados L2 de dimensão 512.
"""

import numpy as np


class FaceEmbedder:
    """
    Extrator de embeddings faciais usando ArcFace R50.
    Produz embeddings normalizados de 512 dimensões.
    """

    def __init__(self, face_analysis):
        """
        Inicializa o embedder com instância de FaceAnalysis.

        Args:
            face_analysis: Instância de insightface.app.FaceAnalysis
                          já inicializada com buffalo_s
        """
        self.face_analysis = face_analysis

    def extract_embedding(self, embedding: np.ndarray) -> np.ndarray:
        """
        Normaliza e retorna o embedding já calculado pelo ArcFace.

        O InsightFace calcula normed_embedding automaticamente ao chamar
        face_analysis.get(image), portanto não é necessário chamar o
        modelo de reconhecimento novamente.

        Args:
            embedding: numpy.ndarray normed_embedding do InsightFace (512,)

        Returns:
            numpy.ndarray de shape (512,) e dtype float32, normalizado L2
        """
        # Já normalizado pelo InsightFace, apenas garantir tipo e shape
        embedding = np.asarray(embedding, dtype=np.float32).reshape(512)
        return embedding
