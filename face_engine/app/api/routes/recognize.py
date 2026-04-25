"""
Rota POST /recognize para reconhecimento facial com thresholds dinâmicos.

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

from app.api.schemas import RecognizeResponse, ThresholdConfig

router = APIRouter(tags=["recognition"])


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


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(
    tenant_id: str = Form(...),
    image: UploadFile = Form(...),
    candidates: str = Form(...),
    recognition_threshold: Optional[float] = Form(None),
    liveness_threshold: Optional[float] = Form(None),
    liveness_v1_weight: Optional[float] = Form(None),
    liveness_v2_weight: Optional[float] = Form(None),
    hsv_saturation_max: Optional[float] = Form(None),
    hsv_saturation_std_min: Optional[float] = Form(None),
    detection_score_min: Optional[float] = Form(None),
) -> RecognizeResponse:
    """
    Reconhece face em imagem contra lista de embeddings criptografados com thresholds dinâmicos.

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
        tenant_id: ID do tenant (cache isolado por tenant)
        image: Frame em multipart/form-data (JPEG/PNG)
        candidates: JSON com lista de embeddings criptografados
        Thresholds opcionais: se None, usa defaults de ThresholdConfig

    Returns:
        RecognizeResponse com status, confidence e scores brutos.
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
    # Montar ThresholdConfig com valores fornecidos ou defaults
    # ------------------------------------------------------------------
    thresholds_dict = {}
    if recognition_threshold is not None:
        thresholds_dict['recognition'] = recognition_threshold
    if liveness_threshold is not None:
        thresholds_dict['liveness'] = liveness_threshold
    if liveness_v1_weight is not None:
        thresholds_dict['liveness_v1_weight'] = liveness_v1_weight
    if liveness_v2_weight is not None:
        thresholds_dict['liveness_v2_weight'] = liveness_v2_weight
    if hsv_saturation_max is not None:
        thresholds_dict['hsv_saturation_max'] = hsv_saturation_max
    if hsv_saturation_std_min is not None:
        thresholds_dict['hsv_saturation_std_min'] = hsv_saturation_std_min
    if detection_score_min is not None:
        thresholds_dict['detection_score_min'] = detection_score_min

    thresholds = ThresholdConfig(**thresholds_dict)

    # ------------------------------------------------------------------
    # Parsear candidatos
    # ------------------------------------------------------------------
    try:
        candidates_list = json.loads(candidates)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="candidates deve ser JSON válido",
        )

    # ------------------------------------------------------------------
    # Decodificar imagem
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
    # Detectar faces
    # ------------------------------------------------------------------
    all_faces = face_detector.detect_all_faces(image_array, min_det_score=thresholds.detection_score_min)

    if len(all_faces) == 0:
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "no_face_detected", None)
        )
        return RecognizeResponse(
            status="no_face_detected",
            processing_ms=int((time.time() - start_time) * 1000),
        )

    if len(all_faces) > 1:
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "multiple_faces", None)
        )
        return RecognizeResponse(
            status="multiple_faces_detected",
            processing_ms=int((time.time() - start_time) * 1000),
        )

    face_data = all_faces[0]
    bbox = face_data["bbox"]
    detection_score_raw = float(face_data.get("det_score", 0.0))

    # ------------------------------------------------------------------
    # Liveness MiniFASNet V1+V2 com pesos dinâmicos
    # ------------------------------------------------------------------
    liveness_v1_raw = None
    liveness_v2_raw = None
    liveness_combined_raw = None

    if liveness_detector is not None:
        is_live, liveness_combined_raw, liveness_v1_raw, liveness_v2_raw = liveness_detector.check(
            face_data["image"],
            bbox,
            threshold=thresholds.liveness,
            v1_weight=thresholds.liveness_v1_weight,
            v2_weight=thresholds.liveness_v2_weight,
        )

        if not is_live:
            asyncio.create_task(
                _save_audit_frame(image_array, tenant_id, "liveness_failed", None)
            )
            return RecognizeResponse(
                status="liveness_failed",
                liveness_v1_raw=liveness_v1_raw,
                liveness_v2_raw=liveness_v2_raw,
                liveness_combined_raw=liveness_combined_raw,
                detection_score_raw=detection_score_raw,
                processing_ms=int((time.time() - start_time) * 1000),
            )
    else:
        liveness_combined_raw = 1.0

    # ------------------------------------------------------------------
    # Análise HSV com thresholds dinâmicos
    # ------------------------------------------------------------------
    is_screen_suspicious, saturation_mean, saturation_std = analyze_screen_saturation(
        image_array,
        bbox,
        saturation_max=thresholds.hsv_saturation_max,
        saturation_std_min=thresholds.hsv_saturation_std_min,
    )

    # Bloqueia se HSV suspeito E score MiniFASNet abaixo de threshold * 1.2
    if is_screen_suspicious and liveness_combined_raw < (thresholds.liveness * 1.2):
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "liveness_failed_screen", None)
        )
        return RecognizeResponse(
            status="liveness_failed",
            liveness_v1_raw=liveness_v1_raw,
            liveness_v2_raw=liveness_v2_raw,
            liveness_combined_raw=liveness_combined_raw,
            saturation_mean=saturation_mean,
            saturation_std=saturation_std,
            detection_score_raw=detection_score_raw,
            processing_ms=int((time.time() - start_time) * 1000),
        )

    # ------------------------------------------------------------------
    # Extrair embedding ArcFace
    # ------------------------------------------------------------------
    query_embedding = face_embedder.extract_embedding(face_data["embedding"])

    # ------------------------------------------------------------------
    # Resolver candidatos
    # ------------------------------------------------------------------
    if not candidates_list:
        return RecognizeResponse(
            status="face_not_recognized",
            liveness_v1_raw=liveness_v1_raw,
            liveness_v2_raw=liveness_v2_raw,
            liveness_combined_raw=liveness_combined_raw,
            saturation_mean=saturation_mean,
            saturation_std=saturation_std,
            detection_score_raw=detection_score_raw,
            processing_ms=int((time.time() - start_time) * 1000),
        )

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
    # Comparação vetorizada com threshold dinâmico
    # ------------------------------------------------------------------
    embeddings_for_comparison = {
        idx: cached_embeddings[c["person_id"]]
        for idx, c in enumerate(candidates_list)
        if c["person_id"] in cached_embeddings
    }

    result = face_comparator.compare_one_vs_many(
        query_embedding,
        embeddings_for_comparison,
        threshold=thresholds.recognition,
    )

    processing_ms = int((time.time() - start_time) * 1000)
    best_distance_raw = None

    # ------------------------------------------------------------------
    # Retornar resultado
    # ------------------------------------------------------------------
    if result is not None:
        idx, best_distance_raw, confidence = result
        person_id_found = candidates_list[idx]["person_id"]

        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "identified", person_id_found)
        )

        return RecognizeResponse(
            status="identified",
            person_id=person_id_found,
            confidence=float(confidence),
            liveness_v1_raw=liveness_v1_raw,
            liveness_v2_raw=liveness_v2_raw,
            liveness_combined_raw=liveness_combined_raw,
            saturation_mean=saturation_mean,
            saturation_std=saturation_std,
            detection_score_raw=detection_score_raw,
            best_distance_raw=best_distance_raw,
            processing_ms=processing_ms,
        )

    asyncio.create_task(
        _save_audit_frame(image_array, tenant_id, "not_identified", None)
    )

    return RecognizeResponse(
        status="face_not_recognized",
        liveness_v1_raw=liveness_v1_raw,
        liveness_v2_raw=liveness_v2_raw,
        liveness_combined_raw=liveness_combined_raw,
        saturation_mean=saturation_mean,
        saturation_std=saturation_std,
        detection_score_raw=detection_score_raw,
        best_distance_raw=best_distance_raw,
        processing_ms=processing_ms,
    )
