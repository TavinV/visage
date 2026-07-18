"""
Rota POST /detect — detecção pura de faces (SCRFD), sem biometria.

Usada pelo backend para validar amostras antes de armazená-las (ex.: coleta
de calibração — impedir frames sem rosto de entrar no cálculo de Youden).
Não extrai embedding, não roda liveness e não toca em DEK.
"""

import time

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, Form, status
from pydantic import BaseModel

router = APIRouter(tags=["detection"])


class DetectedFace(BaseModel):
    det_score: float
    """Confiança do SCRFD (0–1)."""
    area_ratio: float
    """Área do bounding box relativa à imagem (0–1)."""


class DetectResponse(BaseModel):
    face_count: int
    faces: list[DetectedFace]
    processing_ms: int


@router.post("/detect", response_model=DetectResponse)
async def detect_faces(
    image: UploadFile = Form(...),
    min_det_score: float = Form(default=0.60),
) -> DetectResponse:
    """Detecta faces na imagem e retorna contagem + scores brutos."""
    from app.main import face_detector

    start_time = time.time()

    try:
        image_bytes = await image.read()
        image_array = cv2.imdecode(
            np.frombuffer(image_bytes, np.uint8),
            cv2.IMREAD_COLOR,
        )
        if image_array is None:
            raise ValueError()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem inválida ou não decodificável",
        )

    all_faces = face_detector.detect_all_faces(image_array, min_det_score=min_det_score)

    height, width = image_array.shape[:2]
    image_area = float(width * height) or 1.0

    faces: list[DetectedFace] = []
    for face in all_faces:
        x1, y1, x2, y2 = [float(v) for v in face["bbox"][:4]]
        faces.append(
            DetectedFace(
                det_score=float(face.get("det_score", 0.0)),
                area_ratio=max(0.0, (x2 - x1) * (y2 - y1)) / image_area,
            )
        )

    return DetectResponse(
        face_count=len(faces),
        faces=faces,
        processing_ms=int((time.time() - start_time) * 1000),
    )
