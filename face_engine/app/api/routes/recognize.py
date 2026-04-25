"""
Rota POST /recognize para reconhecimento facial.

Pipeline com early exit (ordem obrigatória):
  1. Decodificar imagem
  2. Detectar face (SCRFD)
  3. Liveness MiniFASNet V1+V2
  4. Análise HSV (sinal complementar, não bloqueia sozinha)
  5. Extrair embedding ArcFace
  6. Resolver candidatos do cache
  7. Comparação vetorizada
  8. Audit frame (fire-and-forget assíncrono)
"""

import asyncio
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, Form, status
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter(tags=["recognition"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RecognizeResponse(BaseModel):
    status: str
    candidate_id: Optional[int] = None
    confidence: Optional[float] = None
    liveness_score: Optional[float] = None
    saturation_mean: Optional[float] = None
    best_distance: Optional[float] = None
    processing_ms: int


# ---------------------------------------------------------------------------
# Audit frame helper
# ---------------------------------------------------------------------------

async def _save_audit_frame(
    frame_bgr: np.ndarray,
    tenant_id: str,
    result_status: str,
    person_id: Optional[int],
) -> None:
    """
    Salva frame JPEG para auditoria de forma assíncrona (fire-and-forget).

    Estrutura: ./audit_frames/{tenant_id}/{YYYY-MM-DD}/{ts_ms}_{status}_{id}.jpg
    Falhas são logadas mas nunca propagadas — não bloquear a resposta.
    """
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        ts_ms = int(now.timestamp() * 1000)
        pid_str = str(person_id) if person_id is not None else "unknown"

        audit_dir = Path("audit_frames") / tenant_id / date_str
        audit_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{ts_ms}_{result_status}_{pid_str}.jpg"
        filepath = audit_dir / filename

        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: cv2.imwrite(str(filepath), frame_bgr, encode_params),
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("audit_frame falhou: %s", exc)


@router.post("/recognize", response_model=dict)
async def recognize(
    tenant_id: str = Form(...),
    image: UploadFile = Form(...),
    candidates: str = Form(...),
) -> dict:
    """
    Reconhece face em imagem contra lista de embeddings criptografados.

    Pipeline com early exit:
      1. Decodificar imagem (cv2)
      2. Detectar face (SCRFD) → no_face_detected
      3. Liveness MiniFASNet V1+V2 → liveness_failed
      4. Análise de saturação HSV (complementar)
      5. Extrair embedding ArcFace
      6. Resolver/descriptografar candidatos (cache em RAM)
      7. Comparação vetorizada → not_identified | identified
      8. Audit frame salvo assincronamente (fire-and-forget)

    Args:
        tenant_id:  ID do tenant (cache isolado por tenant)
        image:      Frame em multipart/form-data (JPEG/PNG)
        candidates: JSON com lista de embeddings criptografados

    Returns:
        dict com status, candidate_id, liveness_score, saturation_mean,
        processing_ms e demais campos relevantes.

    Raises:
        HTTP 400: Imagem inválida ou candidates malformado
        HTTP 422: Embedding adulterado (InvalidTag AES-GCM)
    """
    import json
    from app.core.config import settings
    from app.utils.crypto import EmbeddingCrypto
    from app.engine.hsv_analysis import analyze_screen_saturation
    from app.main import (
        face_detector,
        face_embedder,
        liveness_detector,
        face_comparator,
        embedding_cache,
    )

    start_time = time.time()

    # ------------------------------------------------------------------
    # Step 1 — Parsear candidatos
    # ------------------------------------------------------------------
    try:
        candidates_list = json.loads(candidates)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="candidates deve ser JSON válido",
        )

    # ------------------------------------------------------------------
    # Step 2 — Decodificar imagem
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Step 3 — Detectar faces (uma chamada única ao SCRFD)
    # ------------------------------------------------------------------
    all_faces = face_detector.detect_all_faces(image_array, min_det_score=0.75)

    if len(all_faces) == 0:
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "no_face_detected", None)
        )
        return {
            "status": "no_face_detected",
            "processing_ms": int((time.time() - start_time) * 1000),
        }

    if len(all_faces) > 1:
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "multiple_faces", None)
        )
        return {
            "status": "multiple_faces_detected",
            "processing_ms": int((time.time() - start_time) * 1000),
        }

    face_data = all_faces[0]
    bbox = face_data["bbox"]

    # ------------------------------------------------------------------
    # Step 4 — Liveness MiniFASNet V1+V2
    # ------------------------------------------------------------------
    liveness_score = 1.0

    if liveness_detector is not None:
        is_live, liveness_score = liveness_detector.check(face_data["image"], bbox)

        if not is_live:
            asyncio.create_task(
                _save_audit_frame(image_array, tenant_id, "liveness_failed", None)
            )
            return {
                "status": "liveness_failed",
                "liveness_score": round(liveness_score, 4),
                "processing_ms": int((time.time() - start_time) * 1000),
            }

    # ------------------------------------------------------------------
    # Step 5 — Análise HSV (complementar, não bloqueia sozinha)
    # ------------------------------------------------------------------
    is_screen_suspicious, saturation_mean = analyze_screen_saturation(image_array, bbox)

    # Bloqueia se HSV suspeito E score MiniFASNet abaixo de threshold * 1.2
    # (zona cinza: o modelo aprovou por pouco mas o sinal de tela é forte)
    if is_screen_suspicious and liveness_score < (settings.liveness_threshold * 1.2):
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "liveness_failed_screen", None)
        )
        return {
            "status": "liveness_failed",
            "liveness_score": round(liveness_score, 4),
            "saturation_mean": round(saturation_mean, 2),
            "reason": "screen_detected",
            "processing_ms": int((time.time() - start_time) * 1000),
        }

    # ------------------------------------------------------------------
    # Step 6 — Extrair embedding ArcFace
    # ------------------------------------------------------------------
    query_embedding = face_embedder.extract_embedding(face_data["embedding"])

    # ------------------------------------------------------------------
    # Step 7 — Resolver candidatos
    # ------------------------------------------------------------------
    if not candidates_list:
        return {
            "status": "not_identified",
            "processing_ms": int((time.time() - start_time) * 1000),
        }

    crypto = EmbeddingCrypto(settings.aes_key)
    candidate_ids = [c["person_id"] for c in candidates_list]
    cached_embeddings = embedding_cache.get_many(tenant_id, candidate_ids)

    try:
        for candidate in candidates_list:
            person_id = candidate["person_id"]
            if person_id in cached_embeddings:
                continue

            iv         = bytes.fromhex(candidate["embedding_iv"])
            tag        = bytes.fromhex(candidate["embedding_tag"])
            ciphertext = bytes.fromhex(candidate["embedding_ct"])
            embedding  = crypto.decrypt_embedding(iv, tag, ciphertext)

            embedding_cache.set(tenant_id, person_id, embedding)
            cached_embeddings[person_id] = embedding

    except Exception as exc:
        detail = "Embedding corrompido ou adulterado (InvalidTag)" \
            if "InvalidTag" in str(type(exc)) or "tag" in str(exc).lower() \
            else "Erro ao descriptografar embedding"
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)

    # ------------------------------------------------------------------
    # Step 8 — Comparação vetorizada
    # ------------------------------------------------------------------
    embeddings_for_comparison = {
        idx: cached_embeddings[c["person_id"]]
        for idx, c in enumerate(candidates_list)
        if c["person_id"] in cached_embeddings
    }

    result = face_comparator.compare_one_vs_many(query_embedding, embeddings_for_comparison)

    processing_ms = int((time.time() - start_time) * 1000)

    # ------------------------------------------------------------------
    # Step 9 — Retornar + audit assíncrono
    # ------------------------------------------------------------------
    if result is not None:
        idx, _distance, confidence = result
        person_id_found = candidates_list[idx]["person_id"]

        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "identified", person_id_found)
        )

        return {
            "status": "identified",
            "candidate_id": person_id_found,
            "confidence": float(confidence),
            "liveness_score": round(liveness_score, 4),
            "saturation_mean": round(saturation_mean, 2),
            "processing_ms": processing_ms,
        }

    asyncio.create_task(
        _save_audit_frame(image_array, tenant_id, "not_identified", None)
    )

    return {
        "status": "not_identified",
        "liveness_score": round(liveness_score, 4),
        "saturation_mean": round(saturation_mean, 2),
        "processing_ms": processing_ms,
    }

