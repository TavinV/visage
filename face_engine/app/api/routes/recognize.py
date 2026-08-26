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

Instrumentação: cada etapa é cronometrada com time.perf_counter() e reportada
em `timings_ms` (na resposta) e no log `recognize_timing` — diagnóstico de
latência sem depender de profiler externo. `trace_id` (opcional, vindo do
totem) amarra uma captura específica através de frontend → backend → engine.
"""

import asyncio
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, Form, status

from app.api.schemas import RecognizeResponse, ThresholdConfig
from app.core.logging import logger

router = APIRouter(tags=["recognition"])


async def _save_audit_frame(
    frame_bgr: np.ndarray,
    tenant_id: str,
    result_status: str,
    person_id: Optional[int],
    trace_id: Optional[str] = None,
) -> None:
    """
    Salva frame JPEG para auditoria de forma assíncrona (fire-and-forget).

    Estrutura: ./audit_frames/{tenant_id}/{YYYY-MM-DD}/{ts_ms}_{status}_{id}.jpg
    Falhas são logadas mas nunca propagadas — não bloquear a resposta.

    Desligado por padrão (settings.save_audit_frames): apesar de não bloquear a
    resposta, o encode JPEG consome 90-200ms da mesma cota de CPU que a próxima
    requisição precisa, e grava num diretório que não é volume montado.
    """
    from app.core.config import settings

    if not settings.save_audit_frames:
        return

    t0 = time.perf_counter()
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
        logger.info(
            "audit_frame trace=%s status=%s salvo em %.2fms",
            trace_id, result_status, (time.perf_counter() - t0) * 1000.0,
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("audit_frame falhou: %s", exc)


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(
    tenant_id: str = Form(...),
    image: UploadFile = Form(...),
    candidates: str = Form(...),
    dek_ct: str = Form(None),  # DEK criptografada (hex) — opcional se já houver DEK em cache para o tenant
    dek_iv: str = Form(None),  # IV da DEK (hex)
    dek_tag: str = Form(None),  # Tag GCM da DEK (hex)
    dek_key_version: str = Form(default="1"),  # Versão da chave
    recognition_threshold: Optional[float] = Form(None),
    liveness_threshold: Optional[float] = Form(None),
    liveness_v1_weight: Optional[float] = Form(None),
    liveness_v2_weight: Optional[float] = Form(None),
    hsv_saturation_max: Optional[float] = Form(None),
    hsv_saturation_std_min: Optional[float] = Form(None),
    detection_score_min: Optional[float] = Form(None),
    trace_id: Optional[str] = Form(None),  # id de correlação gerado no totem — só para diagnóstico
) -> RecognizeResponse:
    """
    Reconhece face em imagem contra lista de embeddings criptografados com thresholds dinâmicos.
    Suporta DEK per-tenant criptografada com MASTER_KEY.

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
        dek_ct: DEK criptografada com MASTER_KEY (hex format)
        dek_iv: IV de 12 bytes da DEK (hex format)
        dek_tag: Tag de autenticação GCM (hex format)
        dek_key_version: Versão da MASTER_KEY usada para cifrar DEK
        Thresholds opcionais: se None, usa defaults de ThresholdConfig
        trace_id: id de correlação opcional (gerado no totem) para amarrar
            os logs desta captura através de totem → backend → engine

    Returns:
        RecognizeResponse com status, confidence, scores brutos e timings_ms.
    """
    import json
    from app.utils.crypto import EmbeddingCrypto
    from app.engine.hsv_analysis import analyze_screen_saturation
    from app.main import (
        face_detector,
        face_embedder,
        liveness_detector,
        face_comparator,
        embedding_cache,
        dek_manager,  # Novo gerenciador de DEK
        inference_pool,
    )

    start_time = time.time()
    loop = asyncio.get_running_loop()

    # ------------------------------------------------------------------
    # Instrumentação: cada mark() fecha o intervalo desde a marca anterior.
    # Não afeta o pipeline — é só contabilidade para diagnóstico de latência.
    # ------------------------------------------------------------------
    timings: dict[str, float] = {}
    _last_mark = time.perf_counter()

    def mark(key: str) -> None:
        nonlocal _last_mark
        now = time.perf_counter()
        timings[key] = round((now - _last_mark) * 1000.0, 2)
        _last_mark = now

    def finalize_timings() -> dict[str, float]:
        timings["total_ms"] = round((time.time() - start_time) * 1000.0, 2)
        return timings

    # ------------------------------------------------------------------
    # Resolver DEK do tenant (novo fluxo multi-tenant): descriptografa se
    # fornecida na request, senão tenta reaproveitar do cache do DEKManager.
    # ------------------------------------------------------------------
    tenant_dek: Optional[bytes] = None
    if dek_ct and dek_iv and dek_tag:
        try:
            # DEKManager descifra e cacheia a DEK
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

    mark("dek_ms")

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

    mark("thresholds_ms")

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

    mark("candidates_parse_ms")

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

    mark("image_decode_ms")

    # ------------------------------------------------------------------
    # Detectar faces
    #
    # SCRFD é CPU-bound e libera o GIL durante a inferência: rodar no pool
    # mantém o event loop livre para aceitar outras requisições e permite que
    # N capturas simultâneas usem os N núcleos da cota (com intra_op=1).
    # ------------------------------------------------------------------
    all_faces = await loop.run_in_executor(
        inference_pool,
        lambda: face_detector.detect_all_faces(
            image_array, min_det_score=thresholds.detection_score_min
        ),
    )

    mark("detection_ms")

    if len(all_faces) == 0:
        timings_out = finalize_timings()
        logger.info(
            "recognize[%s] trace=%s: NO_FACE — nenhuma face com det_score >= %.2f | timings=%s",
            tenant_id, trace_id, thresholds.detection_score_min, timings_out,
        )
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "no_face_detected", None, trace_id)
        )
        return RecognizeResponse(
            status="no_face_detected",
            processing_ms=int((time.time() - start_time) * 1000),
            timings_ms=timings_out,
        )

    if len(all_faces) > 1:
        timings_out = finalize_timings()
        logger.info(
            "recognize[%s] trace=%s: MULTIPLE_FACES — %d faces (scores: %s) | timings=%s",
            tenant_id, trace_id, len(all_faces),
            ", ".join(f"{f.get('det_score', 0.0):.2f}" for f in all_faces),
            timings_out,
        )
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "multiple_faces", None, trace_id)
        )
        return RecognizeResponse(
            status="multiple_faces_detected",
            processing_ms=int((time.time() - start_time) * 1000),
            timings_ms=timings_out,
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
        # Também no pool: são duas inferências ONNX (V1+V2) que bloqueariam
        # o event loop tanto quanto a detecção.
        is_live, liveness_combined_raw, liveness_v1_raw, liveness_v2_raw = await loop.run_in_executor(
            inference_pool,
            lambda: liveness_detector.check(
                face_data["image"],
                bbox,
                threshold=thresholds.liveness,
                v1_weight=thresholds.liveness_v1_weight,
                v2_weight=thresholds.liveness_v2_weight,
                trace_id=trace_id,
            ),
        )

        mark("liveness_ms")

        # Sempre logar os scores do MiniFASNet — é o dado necessário para
        # debugar falsos positivos de spoofing em câmeras ruins
        logger.info(
            "recognize[%s] trace=%s: liveness v1=%.3f v2=%.3f combinado=%.3f "
            "(threshold=%.2f, pesos=%.2f/%.2f, det=%.3f) -> %s",
            tenant_id, trace_id,
            liveness_v1_raw, liveness_v2_raw, liveness_combined_raw,
            thresholds.liveness,
            thresholds.liveness_v1_weight, thresholds.liveness_v2_weight,
            detection_score_raw,
            "APROVADO" if is_live else "REPROVADO (MiniFASNet)",
        )

        if not is_live:
            timings_out = finalize_timings()
            logger.info("recognize[%s] trace=%s: timings=%s", tenant_id, trace_id, timings_out)
            asyncio.create_task(
                _save_audit_frame(image_array, tenant_id, "liveness_failed", None, trace_id)
            )
            return RecognizeResponse(
                status="liveness_failed",
                liveness_v1_raw=liveness_v1_raw,
                liveness_v2_raw=liveness_v2_raw,
                liveness_combined_raw=liveness_combined_raw,
                detection_score_raw=detection_score_raw,
                processing_ms=int((time.time() - start_time) * 1000),
                timings_ms=timings_out,
            )
    else:
        liveness_combined_raw = 1.0
        mark("liveness_ms")

    # ------------------------------------------------------------------
    # Análise HSV com thresholds dinâmicos
    # ------------------------------------------------------------------
    is_screen_suspicious, saturation_mean, saturation_std = analyze_screen_saturation(
        image_array,
        bbox,
        saturation_max=thresholds.hsv_saturation_max,
        saturation_std_min=thresholds.hsv_saturation_std_min,
    )

    mark("hsv_ms")

    if is_screen_suspicious:
        logger.info(
            "recognize[%s] trace=%s: HSV suspeito de tela — saturação média=%.1f (máx=%.1f) "
            "desvio=%.1f (mín=%.1f); liveness=%.3f vs corte combinado=%.3f",
            tenant_id, trace_id,
            saturation_mean, thresholds.hsv_saturation_max,
            saturation_std, thresholds.hsv_saturation_std_min,
            liveness_combined_raw, thresholds.liveness * 1.2,
        )

    # Bloqueia se HSV suspeito E score MiniFASNet abaixo de threshold * 1.2
    if is_screen_suspicious and liveness_combined_raw < (thresholds.liveness * 1.2):
        timings_out = finalize_timings()
        logger.info(
            "recognize[%s] trace=%s: REPROVADO (HSV+MiniFASNet) — tela suspeita com liveness %.3f < %.3f | timings=%s",
            tenant_id, trace_id, liveness_combined_raw, thresholds.liveness * 1.2, timings_out,
        )
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "liveness_failed_screen", None, trace_id)
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
            timings_ms=timings_out,
        )

    # ------------------------------------------------------------------
    # Extrair embedding ArcFace
    # ------------------------------------------------------------------
    query_embedding = face_embedder.extract_embedding(face_data["embedding"])

    mark("embedding_ms")

    # ------------------------------------------------------------------
    # Resolver candidatos
    # ------------------------------------------------------------------
    if not candidates_list:
        timings_out = finalize_timings()
        logger.info("recognize[%s] trace=%s: sem candidatos | timings=%s", tenant_id, trace_id, timings_out)
        return RecognizeResponse(
            status="face_not_recognized",
            liveness_v1_raw=liveness_v1_raw,
            liveness_v2_raw=liveness_v2_raw,
            liveness_combined_raw=liveness_combined_raw,
            saturation_mean=saturation_mean,
            saturation_std=saturation_std,
            detection_score_raw=detection_score_raw,
            processing_ms=int((time.time() - start_time) * 1000),
            timings_ms=timings_out,
        )

    crypto = EmbeddingCrypto(tenant_dek.hex())
    candidate_ids = [c["person_id"] for c in candidates_list]
    cached_embeddings = embedding_cache.get_many(tenant_id, candidate_ids)

    mark("candidates_cache_lookup_ms")
    cache_hits = len(cached_embeddings)
    cache_misses = len(candidate_ids) - cache_hits

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

    mark("candidates_decrypt_ms")
    timings["candidates_cache_hits"] = float(cache_hits)
    timings["candidates_cache_misses"] = float(cache_misses)

    logger.info(
        "recognize[%s] trace=%s: candidatos %d (cache_hit=%d, cache_miss=%d) — "
        "lookup=%.2fms decrypt=%.2fms",
        tenant_id, trace_id, len(candidate_ids), cache_hits, cache_misses,
        timings["candidates_cache_lookup_ms"], timings["candidates_decrypt_ms"],
    )

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

    mark("comparison_ms")

    processing_ms = int((time.time() - start_time) * 1000)
    best_distance_raw = None

    # ------------------------------------------------------------------
    # Retornar resultado
    # ------------------------------------------------------------------
    if result is not None:
        idx, best_distance_raw, confidence = result
        person_id_found = candidates_list[idx]["person_id"]
        timings_out = finalize_timings()

        logger.info(
            "recognize[%s] trace=%s: IDENTIFICADO person=%s distância=%.3f (threshold=%.2f) "
            "confiança=%.2f, %d candidatos | timings=%s",
            tenant_id, trace_id, person_id_found, best_distance_raw,
            thresholds.recognition, confidence, len(candidates_list), timings_out,
        )
        asyncio.create_task(
            _save_audit_frame(image_array, tenant_id, "identified", person_id_found, trace_id)
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
            timings_ms=timings_out,
        )

    # Menor distância mesmo sem match — mostra o quão perto o melhor
    # candidato ficou do threshold (essencial para debugar quase-matches)
    all_distances = face_comparator.compute_distances(
        query_embedding, embeddings_for_comparison
    )
    if all_distances:
        best_distance_raw = float(min(all_distances.values()))

    timings_out = finalize_timings()

    logger.info(
        "recognize[%s] trace=%s: NAO_IDENTIFICADO — melhor distância %s vs threshold %.2f "
        "(%d candidatos) | timings=%s",
        tenant_id, trace_id,
        f"{best_distance_raw:.3f}" if best_distance_raw is not None else "n/a",
        thresholds.recognition, len(candidates_list), timings_out,
    )
    asyncio.create_task(
        _save_audit_frame(image_array, tenant_id, "not_identified", None, trace_id)
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
        timings_ms=timings_out,
    )
