"""
Rotas POST /enroll/frame e POST /enroll/finalize.

Fluxo de cadastro biométrico via QR Code (consumido pelo Node.js):

  /enroll/frame — pipeline MAIS RIGOROSO que /recognize:
    - SCRFD com det_score >= 0.75 por padrão; o Node manda um mínimo menor
      nas fotos de rosto virado. O det_score é a confiança de que HÁ um rosto,
      não uma medida de nitidez: o buffalo_s (det_500m, entrada 320) dá
      0.74–0.85 a rostos frontais bem iluminados conforme a pessoa, e cai
      0.05–0.15 com a cabeça virada. Com 0.80 algumas pessoas não conseguiam
      se cadastrar em nenhuma luz.
    - Liveness com threshold de enrollment (default 0.90, vs 0.85)
    - Exatamente UMA face no frame
    Frame aprovado retorna o embedding cifrado individualmente com a DEK
    do tenant (mesmo formato de /embeddings/register). Frame reprovado
    retorna status claro para o totem re-tentar.

  /enroll/finalize — recebe os N embeddings cifrados acumulados pelo Node,
    decifra, calcula a média vetorial, normaliza L2 e re-cifra o embedding
    consolidado. A engine não persiste nada.
"""

import time
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, Form, status
from cryptography.exceptions import InvalidTag

from app.api.schemas import (
    EnrollFrameResponse,
    EnrollFinalizeRequest,
    EnrollFinalizeResponse,
)
from app.core.logging import logger

router = APIRouter(tags=["enrollment"], prefix="/enroll")

# Thresholds de cadastro — mais rigorosos que o reconhecimento
ENROLLMENT_DET_SCORE_MIN = 0.75
ENROLLMENT_LIVENESS_THRESHOLD_DEFAULT = 0.90


def _resolve_tenant_dek(
    tenant_id: str,
    dek_ct: Optional[str],
    dek_iv: Optional[str],
    dek_tag: Optional[str],
    dek_key_version: str,
) -> bytes:
    """Resolve a DEK do tenant: descriptografa se fornecida, senão usa cache."""
    from app.main import dek_manager

    tenant_dek: Optional[bytes] = None
    if dek_ct and dek_iv and dek_tag:
        try:
            tenant_dek = dek_manager.decrypt_dek(
                tenant_id=tenant_id,
                dek_ct_hex=dek_ct,
                dek_iv_hex=dek_iv,
                dek_tag_hex=dek_tag,
                key_version=dek_key_version,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Erro ao descriptografar DEK: {str(exc)}",
            )
    else:
        tenant_dek = dek_manager.get_cached_dek(tenant_id)

    if tenant_dek is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="DEK do tenant não fornecida e nenhuma DEK em cache para este tenant",
        )

    return tenant_dek


@router.post("/frame", response_model=EnrollFrameResponse)
async def enroll_frame(
    tenant_id: str = Form(...),
    image: UploadFile = Form(...),
    dek_ct: str = Form(None),
    dek_iv: str = Form(None),
    dek_tag: str = Form(None),
    dek_key_version: str = Form(default="1"),
    liveness_threshold: Optional[float] = Form(None),
    detection_score_min: Optional[float] = Form(None),
) -> EnrollFrameResponse:
    """
    Processa um frame individual do fluxo de cadastro.

    Pipeline: decodificar → SCRFD (det >= mínimo, exatamente 1 face) →
    liveness (threshold de enrollment) → ArcFace → cifrar com DEK do tenant.

    Frames rejeitados retornam HTTP 200 com status explicativo — o totem
    exibe feedback vermelho e captura novamente.
    """
    from app.utils.crypto import EmbeddingCrypto
    from app.main import face_detector, face_embedder, liveness_detector

    start_time = time.time()
    tenant_dek = _resolve_tenant_dek(tenant_id, dek_ct, dek_iv, dek_tag, dek_key_version)

    effective_liveness_threshold = (
        liveness_threshold
        if liveness_threshold is not None
        else ENROLLMENT_LIVENESS_THRESHOLD_DEFAULT
    )
    effective_det_score_min = (
        detection_score_min
        if detection_score_min is not None
        else ENROLLMENT_DET_SCORE_MIN
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

    def elapsed_ms() -> int:
        return int((time.time() - start_time) * 1000)

    # ------------------------------------------------------------------
    # Detecção com o mínimo de cadastro (padrão 0.75; menor no rosto virado)
    # ------------------------------------------------------------------
    all_faces = face_detector.detect_all_faces(
        image_array, min_det_score=effective_det_score_min
    )

    if len(all_faces) == 0:
        # Distinguir "sem face" de "face com score baixo" para feedback melhor
        relaxed = face_detector.detect_all_faces(image_array, min_det_score=0.5)
        reason = "low_detection_score" if len(relaxed) > 0 else "no_face_detected"
        best_relaxed: Optional[float] = None
        if reason == "low_detection_score":
            best_relaxed = max(float(f.get("det_score", 0.0)) for f in relaxed)
            logger.info(
                "enroll[%s]: LOW_DETECTION_SCORE — melhor face %.3f < mínimo %.2f",
                tenant_id, best_relaxed, effective_det_score_min,
            )
        else:
            logger.info(
                "enroll[%s]: NO_FACE — nenhuma face nem com det_score 0.5",
                tenant_id,
            )
        # Score medido volta na resposta para o Node registrar e calibrar o corte
        return EnrollFrameResponse(
            status=reason,
            detection_score=best_relaxed,
            processing_ms=elapsed_ms(),
        )

    if len(all_faces) > 1:
        logger.info(
            "enroll[%s]: MULTIPLE_FACES — %d faces no frame", tenant_id, len(all_faces)
        )
        return EnrollFrameResponse(
            status="multiple_faces_detected", processing_ms=elapsed_ms()
        )

    face_data = all_faces[0]
    detection_score = float(face_data.get("det_score", 0.0))

    # ------------------------------------------------------------------
    # Liveness rigoroso (default 0.90 vs 0.85 do reconhecimento)
    # ------------------------------------------------------------------
    liveness_score: Optional[float] = None
    if liveness_detector is not None:
        is_live, liveness_score, _v1, _v2 = liveness_detector.check(
            face_data["image"],
            face_data["bbox"],
            threshold=effective_liveness_threshold,
        )
        logger.info(
            "enroll[%s]: liveness v1=%.3f v2=%.3f combinado=%.3f "
            "(threshold=%.2f, det=%.3f) -> %s",
            tenant_id, _v1, _v2, liveness_score,
            effective_liveness_threshold, detection_score,
            "APROVADO" if is_live else "REPROVADO",
        )
        if not is_live:
            return EnrollFrameResponse(
                status="liveness_failed",
                liveness_score=liveness_score,
                detection_score=detection_score,
                processing_ms=elapsed_ms(),
            )

    # ------------------------------------------------------------------
    # Extrair embedding e cifrar individualmente com a DEK do tenant
    # ------------------------------------------------------------------
    embedding = face_embedder.extract_embedding(face_data["embedding"])

    crypto = EmbeddingCrypto(tenant_dek.hex())
    iv, tag, ciphertext = crypto.encrypt_embedding(embedding)

    return EnrollFrameResponse(
        status="frame_accepted",
        embedding_iv=iv.hex(),
        embedding_tag=tag.hex(),
        embedding_ct=ciphertext.hex(),
        liveness_score=liveness_score,
        detection_score=detection_score,
        processing_ms=elapsed_ms(),
    )


@router.post("/finalize", response_model=EnrollFinalizeResponse)
async def enroll_finalize(request: EnrollFinalizeRequest) -> EnrollFinalizeResponse:
    """
    Consolida os N embeddings do cadastro:
      1. Decifra cada embedding com a DEK do tenant
      2. Calcula a média vetorial
      3. Renormaliza L2 (obrigatório após média)
      4. Cifra o resultado com AES-256-GCM (IV único)

    InvalidTag em qualquer frame → HTTP 422. NUNCA silenciado: indica frame
    adulterado ou cifrado com DEK de outro tenant.
    """
    from app.utils.crypto import EmbeddingCrypto
    from app.main import dek_manager

    try:
        tenant_dek = dek_manager.decrypt_dek(
            tenant_id=request.tenant_id,
            dek_ct_hex=request.tenant_dek.dek_ct,
            dek_iv_hex=request.tenant_dek.dek_iv,
            dek_tag_hex=request.tenant_dek.dek_tag,
            key_version=request.tenant_dek.key_version,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao descriptografar DEK: {str(exc)}",
        )

    crypto = EmbeddingCrypto(tenant_dek.hex())

    embeddings: list[np.ndarray] = []
    try:
        for frame in request.frames:
            embedding = crypto.decrypt_embedding(
                bytes.fromhex(frame.embedding_iv),
                bytes.fromhex(frame.embedding_tag),
                bytes.fromhex(frame.embedding_ct),
            )
            embeddings.append(embedding)
    except InvalidTag:
        # JAMAIS capturar silenciosamente — frame adulterado ou DEK errada
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Embedding de frame corrompido ou adulterado (InvalidTag)",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Frame inválido: {str(exc)}",
        )

    # Média vetorial + renormalização L2
    mean_embedding = np.mean(
        np.array(embeddings, dtype=np.float32), axis=0
    ).astype(np.float32)

    norm = np.linalg.norm(mean_embedding)
    if norm > 0:
        mean_embedding = mean_embedding / norm

    iv, tag, ciphertext = crypto.encrypt_embedding(mean_embedding)

    return EnrollFinalizeResponse(
        embedding_iv=iv.hex(),
        embedding_tag=tag.hex(),
        embedding_ct=ciphertext.hex(),
        key_version=request.tenant_dek.key_version,
        model_version="arcface_r50_v1",
        frames_used=len(embeddings),
    )
