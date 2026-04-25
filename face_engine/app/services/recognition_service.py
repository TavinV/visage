"""Recognition service orchestration."""

from typing import Optional, Tuple

import numpy as np

from app.engine.detector import FaceDetector
from app.engine.embedder import FaceEmbedder
from app.engine.liveness import LivenessDetector
from app.engine.hsv_analysis import analyze_screen_saturation
from app.engine.comparator import FaceComparator


class RecognitionService:
    """Orchestrate face detection, liveness check, and comparison."""

    def __init__(
        self,
        detector: FaceDetector,
        embedder: FaceEmbedder,
        liveness_detector: LivenessDetector,
        comparator: FaceComparator,
    ):
        self.detector = detector
        self.embedder = embedder
        self.liveness_detector = liveness_detector
        self.comparator = comparator

    async def recognize(
        self,
        image: np.ndarray,
        candidates: dict,
        recognition_threshold: float = 1.10,
        liveness_threshold: float = 0.85,
    ) -> Optional[Tuple[str, float, float, float, float]]:
        """
        Recognize face in image.
        
        Returns:
            (person_id, confidence, liveness_score, saturation_mean, processing_ms)
            or None if no match found
        """
        # TODO: Call detector → liveness → comparison pipeline
        pass
