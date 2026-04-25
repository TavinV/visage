"""
Detector de faces usando SCRFD via InsightFace.
Detecta faces, realiza alinhamento e aplica critérios de qualidade.
Suporta detecção de múltiplos rostos com análise avançada.
"""

import cv2
import numpy as np
from typing import Optional, List, Dict, Tuple


class FaceDetector:
    """
    Detector de faces usando SCRFD do InsightFace.
    Responsável por detectar, alinhar e filtrar faces em imagens.
    Detecta múltiplos rostos e fornece análises complementares.
    """

    # Constantes de validação
    DET_SCORE_THRESHOLD = 0.75  # Confiança mínima da detecção
    MIN_FACE_SIZE_PIXELS = 40   # Tamanho mínimo de face (lado)
    OVERLAP_THRESHOLD = 0.3     # Threshold de IOU para considerar faces sobrepostas

    def __init__(self, face_analysis):
        """
        Inicializa o detector com instância de FaceAnalysis.

        Args:
            face_analysis: Instância de insightface.app.FaceAnalysis
                          já inicializada com buffalo_s
        """
        self.face_analysis = face_analysis

    def detect_and_align(self, image: np.ndarray) -> Optional[dict]:
        """
        Detecta face em imagem e retorna a de maior área.

        Aplicam-se filtros:
        - det_score >= 0.75
        - Maior bounding box (mais próxima do totem)
        - Redimensiona imagem para máximo 640px antes de detectar

        Args:
            image: numpy.ndarray da imagem (BGR ou RGB)

        Returns:
            Dicionário com informações da face detectada ou None se nenhuma encontrada.
            Estrutura: {
                'bbox': [x1, y1, x2, y2],
                'kps': [[x1,y1], [x2,y2], ...],  # keypoints de alinhamento
                'det_score': float,
                'aligned': imagem alinhada
            }
        """
        # Redimensionar imagem se necessário (máximo 640px no maior lado)
        image = self._resize_for_detection(image)

        # Detectar faces
        faces = self.face_analysis.get(image)

        if not faces:
            return None

        # Filtrar por det_score >= 0.75 e tamanho mínimo
        valid_faces = [
            f for f in faces 
            if f.det_score >= self.DET_SCORE_THRESHOLD
            and self._get_face_size(f.bbox) >= self.MIN_FACE_SIZE_PIXELS
        ]

        if not valid_faces:
            return None

        # Selecionar face com maior área de bounding box
        best_face = max(valid_faces, key=lambda f: self._bbox_area(f.bbox))

        # normed_embedding já calculado pelo ArcFace durante face_analysis.get()
        return {
            "bbox": best_face.bbox,
            "kps": best_face.kps,
            "det_score": best_face.det_score,
            "image": image,          # imagem redimensionada (para liveness crop)
            "embedding": best_face.normed_embedding,
        }

    def detect_all_faces(self, image: np.ndarray, min_det_score: float = 0.75) -> List[dict]:
        """
        Detecta TODAS as faces na imagem com filtros de qualidade.

        Args:
            image: numpy.ndarray da imagem (BGR ou RGB)
            min_det_score: Confiança mínima (padrão 0.75)

        Returns:
            Lista de dicionários com faces detectadas, ordenadas por área (maior primeiro)
        """
        # Redimensionar imagem se necessário
        image_resized = self._resize_for_detection(image)

        # Detectar faces
        faces = self.face_analysis.get(image_resized)

        if not faces:
            return []

        # Filtrar por det_score e tamanho mínimo
        valid_faces = [
            f for f in faces
            if f.det_score >= min_det_score
            and self._get_face_size(f.bbox) >= self.MIN_FACE_SIZE_PIXELS
        ]

        # Converter para dicionários e ordenar por área (decrescente)
        face_list = [
            {
                "bbox": f.bbox,
                "kps": f.kps,
                "det_score": float(f.det_score),
                "area": self._bbox_area(f.bbox),
                "size_px": self._get_face_size(f.bbox),
                "image": image_resized,
                "embedding": f.normed_embedding,
            }
            for f in valid_faces
        ]

        return sorted(face_list, key=lambda x: x["area"], reverse=True)

    def analyze_multiple_faces(self, image: np.ndarray) -> Dict:
        """
        Analisa presença de múltiplos rostos com heurísticas avançadas.

        Retorna informações sobre:
        - Quantidade de faces detectadas
        - Proximity issues (faces muito próximas = possível falso positivo)
        - Rank de confiabilidade de cada rosto
        - Recomendação de ação

        Args:
            image: numpy.ndarray da imagem

        Returns:
            Dicionário com análise completa:
            {
                'face_count': int,
                'faces': [
                    {
                        'bbox': [...],
                        'det_score': float,
                        'area': float,
                        'rank': int,
                        'quality_score': float,
                        'is_primary': bool
                    },
                    ...
                ],
                'has_overlaps': bool,
                'overlapping_pairs': [
                    {'face1_idx': int, 'face2_idx': int, 'iou': float},
                    ...
                ],
                'recommendation': str,  # 'ok' | 'multiple_faces' | 'unclear' | 'too_many'
            }
        """
        all_faces = self.detect_all_faces(image, min_det_score=self.DET_SCORE_THRESHOLD)

        if not all_faces:
            return {
                'face_count': 0,
                'faces': [],
                'has_overlaps': False,
                'overlapping_pairs': [],
                'recommendation': 'no_faces',
            }

        # Analisar primeira face (considerada principal)
        primary_area = all_faces[0]["area"] if all_faces else 0

        # Calcular quality score de cada face
        faces_with_quality = []
        for rank, face in enumerate(all_faces):
            # Quality score: combinação de det_score e área relativa
            # faces muito menores que a principal recebem score menor
            area_ratio = face["area"] / primary_area if primary_area > 0 else 0
            quality_score = float(face["det_score"]) * (0.7 + 0.3 * min(area_ratio, 1.0))

            faces_with_quality.append({
                **face,
                "rank": rank,
                "quality_score": quality_score,
                "is_primary": rank == 0,
                "area_ratio_to_primary": area_ratio,
            })

        # Detectar sobreposições
        overlapping_pairs = []
        for i in range(len(faces_with_quality)):
            for j in range(i + 1, len(faces_with_quality)):
                iou = self._compute_iou(
                    faces_with_quality[i]["bbox"],
                    faces_with_quality[j]["bbox"]
                )
                if iou > self.OVERLAP_THRESHOLD:
                    overlapping_pairs.append({
                        "face1_idx": i,
                        "face2_idx": j,
                        "iou": float(iou),
                    })

        # Gerar recomendação
        if len(all_faces) == 1:
            recommendation = "ok"
        elif len(all_faces) == 2:
            # Duas faces: verificar se uma é muito menor (possível falso positivo de reflexo)
            if faces_with_quality[1]["area_ratio_to_primary"] < 0.2:
                recommendation = "ok"  # Face secundária é muito pequena, ignorar
            elif overlapping_pairs:
                recommendation = "unclear"  # Faces sobrepostas
            else:
                recommendation = "multiple_faces"  # Duas faces claras
        else:
            # 3+ faces
            significant_faces = sum(1 for f in faces_with_quality if f["area_ratio_to_primary"] > 0.2)
            if significant_faces > 2:
                recommendation = "too_many"
            else:
                recommendation = "multiple_faces"

        return {
            "face_count": len(all_faces),
            "faces": faces_with_quality,
            "has_overlaps": len(overlapping_pairs) > 0,
            "overlapping_pairs": overlapping_pairs,
            "recommendation": recommendation,
        }

    @staticmethod
    def _resize_for_detection(image: np.ndarray, max_size: int = 640) -> np.ndarray:
        """
        Redimensiona imagem mantendo proporção, máximo max_size no maior lado.

        Args:
            image: numpy.ndarray da imagem
            max_size: Tamanho máximo em pixels

        Returns:
            Imagem redimensionada
        """
        height, width = image.shape[:2]
        max_dim = max(height, width)

        if max_dim > max_size:
            scale = max_size / max_dim
            new_width = int(width * scale)
            new_height = int(height * scale)
            image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_LINEAR)

        return image

    @staticmethod
    def _bbox_area(bbox: np.ndarray) -> float:
        """
        Calcula área do bounding box [x1, y1, x2, y2].

        Args:
            bbox: Array com coordenadas [x1, y1, x2, y2]

        Returns:
            Área do bounding box
        """
        x1, y1, x2, y2 = bbox
        return (x2 - x1) * (y2 - y1)

    @staticmethod
    def _get_face_size(bbox: np.ndarray) -> float:
        """
        Retorna o tamanho (lado) da face em pixels (maior dimensão).

        Args:
            bbox: Array com coordenadas [x1, y1, x2, y2]

        Returns:
            Máximo entre altura e largura da face
        """
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        return max(width, height)

    @staticmethod
    def _compute_iou(bbox1: np.ndarray, bbox2: np.ndarray) -> float:
        """
        Computa Intersection over Union (IoU) entre dois bounding boxes.

        Args:
            bbox1: [x1, y1, x2, y2]
            bbox2: [x1, y1, x2, y2]

        Returns:
            IoU entre 0 e 1
        """
        x1_min, y1_min, x1_max, y1_max = bbox1
        x2_min, y2_min, x2_max, y2_max = bbox2

        # Calcular interseção
        inter_xmin = max(x1_min, x2_min)
        inter_ymin = max(y1_min, y2_min)
        inter_xmax = min(x1_max, x2_max)
        inter_ymax = min(y1_max, y2_max)

        if inter_xmax < inter_xmin or inter_ymax < inter_ymin:
            return 0.0

        inter_area = (inter_xmax - inter_xmin) * (inter_ymax - inter_ymin)

        # Calcular união
        box1_area = (x1_max - x1_min) * (y1_max - y1_min)
        box2_area = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = box1_area + box2_area - inter_area

        if union_area == 0:
            return 0.0

        return inter_area / union_area
