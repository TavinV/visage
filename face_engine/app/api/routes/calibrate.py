"""
Rota POST /calibrate para calibração e otimização de thresholds.

Processa amostras de pessoas reais e ataques, analisa os scores brutos,
e sugere thresholds otimizados usando o índice de Youden para balancear
sensibilidade e especificidade.
"""

import asyncio
from typing import Optional, Literal
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, UploadFile, HTTPException, status

from app.api.schemas import (
    CalibrationSampleResult,
    ThresholdAnalysis,
    CalibrateResponse,
    ThresholdConfig,
    RecognitionSampleResult,
    RecognitionCalibrateResponse,
)

router = APIRouter(tags=["calibration"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _find_optimal_threshold(
    real_scores: list[float],
    attack_scores: list[float],
    direction: Literal['higher_is_real', 'lower_is_real'],
    genuine_bias: float = 0.05,
) -> tuple[float, float, float, float]:
    """
    Encontra threshold usando EER (Equal Error Rate) — padrão biométrico ISO/IEC 19795.

    EER é o ponto onde FAR ≈ FRR (as curvas se cruzam):
        FAR (False Accept Rate) = fração de ataques/impostores incorretamente aceitos
        FRR (False Reject Rate) = fração de reais incorretamente rejeitados

    Usa 1000 pontos interpolados para curva suave (em vez de só valores observados),
    eliminando o viés de puxar o threshold até o máximo dos scores genuínos.

    Após o EER, aplica um bias leve: aceita o threshold mais permissivo onde FAR
    não excede (eer_far + genuine_bias). Isso reduz rejeições falsas sem abrir
    brechas excessivas para ataques.

    Args:
        real_scores:   Scores/distâncias de amostras reais ou genuínas
        attack_scores: Scores/distâncias de ataques/impostores
        direction:     'higher_is_real' para liveness; 'lower_is_real' para distâncias L2
        genuine_bias:  Quanto FAR pode aumentar acima do EER para aceitar mais reais (padrão 5%)

    Returns:
        (threshold, real_pass_rate, attack_block_rate, youden_score)
    """
    real_arr = np.array(real_scores, dtype=np.float64)
    attack_arr = np.array(attack_scores, dtype=np.float64)

    all_min = float(min(real_arr.min(), attack_arr.min()))
    all_max = float(max(real_arr.max(), attack_arr.max()))

    # 1000 candidatos interpolados — elimina o viés de usar só valores observados
    candidates = np.linspace(all_min, all_max, 1000)

    # --- Passo 1: encontrar EER ---
    eer_threshold = float(candidates[0])
    eer_far = 1.0
    eer_frr = 1.0
    min_diff = float('inf')

    for t in candidates:
        if direction == 'higher_is_real':
            far = float(np.mean(attack_arr >= t))   # ataques indevidamente aceitos
            frr = float(np.mean(real_arr < t))      # reais indevidamente rejeitados
        else:  # lower_is_real (distâncias L2)
            far = float(np.mean(attack_arr <= t))   # impostores indevidamente aceitos
            frr = float(np.mean(real_arr > t))      # genuínos indevidamente rejeitados

        diff = abs(far - frr)
        if diff < min_diff:
            min_diff = diff
            eer_threshold = float(t)
            eer_far = far
            eer_frr = frr

    eer_real_pass = 1.0 - eer_frr
    eer_attack_block = 1.0 - eer_far

    # --- Passo 2: bias leve — aceita mais reais sem ultrapassar max_far ---
    # Para lower_is_real: FAR e real_pass são monotônicas em t (crescem juntos).
    #   → maior t que satisfaz FAR ≤ max_far dá melhor real_pass → varrer desc.
    # Para higher_is_real: FAR e real_pass crescem ao diminuir t.
    #   → menor t que satisfaz FAR ≤ max_far → varrer asc.
    max_far = eer_far + genuine_bias
    best_threshold = eer_threshold
    best_real_pass = eer_real_pass
    best_attack_block = eer_attack_block

    if direction == 'lower_is_real':
        for t in candidates[::-1]:  # do maior para o menor
            far_t = float(np.mean(attack_arr <= t))
            if far_t <= max_far:
                best_threshold = float(t)
                best_real_pass = float(np.mean(real_arr <= t))
                best_attack_block = 1.0 - far_t
                break
    else:  # higher_is_real
        for t in candidates:        # do menor para o maior
            far_t = float(np.mean(attack_arr >= t))
            if far_t <= max_far:
                best_threshold = float(t)
                best_real_pass = float(np.mean(real_arr >= t))
                best_attack_block = 1.0 - far_t
                break

    youden = best_real_pass + best_attack_block - 1.0
    return best_threshold, best_real_pass, best_attack_block, youden


def _confidence_level(n_real: int, n_attack: int) -> Literal['low', 'medium', 'high']:
    """
    Determina o nível de confiança baseado no número de amostras válidas.

    low: < 5 amostras de algum tipo
    medium: 5-9 amostras de cada tipo
    high: 10+ amostras de cada tipo
    """
    min_samples = min(n_real, n_attack) if n_real > 0 and n_attack > 0 else 0
    if min_samples < 5:
        return 'low'
    elif min_samples < 10:
        return 'medium'
    else:
        return 'high'


def _generate_interpretation_liveness(
    metric: str,
    threshold: float,
    real_pass_rate: float,
    attack_block_rate: float,
    youden_score: float,
    confidence: Literal['low', 'medium', 'high'],
    n_real: int,
    n_attack: int,
) -> str:
    """
    Gera interpretação em português para análise de liveness.
    """
    parts = []

    # Qualidade da separação
    if attack_block_rate >= 0.95 and real_pass_rate >= 0.95:
        parts.append(
            f"Excelente separação. Com threshold {threshold:.2f}, "
            f"{real_pass_rate * 100:.0f}% das pessoas reais passam e "
            f"{attack_block_rate * 100:.0f}% dos ataques são bloqueados."
        )
    elif attack_block_rate < 0.80:
        parts.append(
            f"Separação fraca para ataques. Apenas {attack_block_rate * 100:.0f}% dos ataques "
            f"seriam bloqueados. Considere melhorar a iluminação ou testar com ataques mais variados."
        )
    elif real_pass_rate < 0.85:
        parts.append(
            f"Threshold muito restritivo — {real_pass_rate * 100:.0f}% das pessoas reais passariam. "
            f"Muitos funcionários/alunos podem ser bloqueados. Reduza o threshold ou capture "
            f"amostras reais com melhor qualidade."
        )
    else:
        parts.append(
            f"Boa separação. Com threshold {threshold:.2f}, {real_pass_rate * 100:.0f}% das pessoas "
            f"reais passam e {attack_block_rate * 100:.0f}% dos ataques são bloqueados."
        )

    # Confiança
    if confidence == 'low':
        parts.append(
            f" ⚠️ Resultado indicativo — menos de 5 amostras válidas em algum grupo. "
            f"Capture mais amostras para maior precisão."
        )

    return "".join(parts)


def _generate_interpretation_hsv(
    threshold: float,
    real_pass_rate: float,
    attack_block_rate: float,
    youden_score: float,
    confidence: Literal['low', 'medium', 'high'],
) -> str:
    """
    Gera interpretação em português para análise HSV de saturação.
    """
    parts = []

    if attack_block_rate >= 0.8 and real_pass_rate >= 0.9:
        parts.append(
            f"Boa separação por saturação. Com limite de {threshold:.1f}, "
            f"{real_pass_rate * 100:.0f}% das amostras reais passam e "
            f"{attack_block_rate * 100:.0f}% dos ataques são detectados como tela."
        )
    elif attack_block_rate < 0.5:
        parts.append(
            f"Separação fraca por saturação — apenas {attack_block_rate * 100:.0f}% dos ataques seriam "
            f"detectados. Use este threshold como complemento ao liveness, não como bloqueador direto."
        )
    elif real_pass_rate < 0.85:
        parts.append(
            f"Muitas amostras reais estão sendo marcadas como suspeitas de tela "
            f"({real_pass_rate * 100:.0f}% passam). Aumente o threshold de saturação ou revise a iluminação."
        )
    else:
        parts.append(
            f"Separação aceitável. Limite sugerido: {threshold:.1f}."
        )

    if confidence == 'low':
        parts.append(" ⚠️ Poucas amostras — resultado indicativo.")

    return "".join(parts)


async def _process_image(
    file: UploadFile,
    label: Literal['real', 'attack'],
    liveness_detector,
    face_detector,
    face_embedder,
) -> CalibrationSampleResult:
    """
    Processa uma única imagem: detecta face, calcula scores brutos.
    Nunca descartar por threshold — sempre retornar scores.
    """
    try:
        # Ler arquivo
        content = await file.read()
        image_array = cv2.imdecode(
            np.frombuffer(content, np.uint8),
            cv2.IMREAD_COLOR,
        )

        if image_array is None:
            return CalibrationSampleResult(
                label=label,
                face_detected=False,
                error="Não foi possível decodificar a imagem",
            )

        # Detectar face
        all_faces = face_detector.detect_all_faces(image_array, min_det_score=0.50)

        if len(all_faces) == 0:
            return CalibrationSampleResult(
                label=label,
                face_detected=False,
                error="Nenhuma face detectada",
            )

        face_data = all_faces[0]
        bbox = face_data["bbox"]
        detection_score = float(face_data.get("det_score", 0.0))

        # Liveness com pesos defaults
        liveness_v1_raw = None
        liveness_v2_raw = None
        liveness_combined = None

        if liveness_detector is not None:
            _, liveness_combined, liveness_v1_raw, liveness_v2_raw = liveness_detector.check(
                face_data["image"],
                bbox,
                threshold=0.0,  # Retornar score sem filtro
                v1_weight=0.40,
                v2_weight=0.60,
            )

        # HSV
        from app.engine.hsv_analysis import analyze_screen_saturation
        is_suspicious, saturation_mean, saturation_std = analyze_screen_saturation(
            image_array,
            bbox,
            saturation_max=255.0,  # Sem filtro para capturar scores brutos
            saturation_std_min=0.0,
        )

        return CalibrationSampleResult(
            label=label,
            face_detected=True,
            detection_score=detection_score,
            liveness_v1_raw=liveness_v1_raw,
            liveness_v2_raw=liveness_v2_raw,
            liveness_combined=liveness_combined,
            saturation_mean=saturation_mean,
            saturation_std=saturation_std,
            error=None,
        )

    except Exception as e:
        return CalibrationSampleResult(
            label=label,
            face_detected=False,
            error=f"Erro ao processar: {str(e)[:100]}",
        )


# ============================================================================
# ROTA POST /calibrate/liveness
# ============================================================================

@router.post("/calibrate/liveness", response_model=CalibrateResponse)
async def calibrate(
    real_images: list[UploadFile] = File(...),
    attack_images: list[UploadFile] = File(...),
) -> CalibrateResponse:
    """
    Calibra thresholds para reconhecimento facial processando amostras reais e ataques.

    Aceita 1-20 imagens de cada tipo, processa para extrair scores brutos de cada
    componente (detection, liveness v1/v2, saturação HSV), e sugere thresholds
    otimizados usando índice de Youden.

    Args:
        real_images: 1-20 imagens de pessoas reais
        attack_images: 1-20 imagens de ataques (fotos de tela, impressas, etc)

    Returns:
        CalibrateResponse com análise completa e thresholds sugeridos
    """
    from app.main import liveness_detector, face_detector, face_embedder

    # Validações
    if len(real_images) < 1 or len(attack_images) < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mínimo 1 imagem de cada tipo requerida",
        )

    if len(real_images) > 20 or len(attack_images) > 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Máximo 20 imagens de cada tipo",
        )

    # Processar imagens em paralelo
    real_tasks = [
        _process_image(img, 'real', liveness_detector, face_detector, face_embedder)
        for img in real_images
    ]
    attack_tasks = [
        _process_image(img, 'attack', liveness_detector, face_detector, face_embedder)
        for img in attack_images
    ]

    real_results = await asyncio.gather(*real_tasks)
    attack_results = await asyncio.gather(*attack_tasks)

    # Consolidar todas as amostras
    all_samples = real_results + attack_results

    # Filtrar apenas com face detectada
    real_valid = [s for s in real_results if s.face_detected and s.liveness_combined is not None]
    attack_valid = [s for s in attack_results if s.face_detected and s.liveness_combined is not None]

    # Validar que há dados suficientes
    if len(real_valid) < 1 or len(attack_valid) < 1:
        reason = ""
        if len(real_valid) < 1:
            reason = f"Nenhuma face detectada em amostras reais ({len(real_results)} processadas)"
        else:
            reason = f"Nenhuma face detectada em amostras de ataque ({len(attack_results)} processadas)"

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=reason,
        )

    # Extrair scores brutos
    real_liveness_scores = [s.liveness_combined for s in real_valid]
    attack_liveness_scores = [s.liveness_combined for s in attack_valid]

    real_saturation_scores = [s.saturation_mean for s in real_valid]
    attack_saturation_scores = [s.saturation_mean for s in attack_valid]

    # Encontrar thresholds ótimos
    liveness_threshold, liveness_real_pass, liveness_attack_block, liveness_youden = \
        _find_optimal_threshold(real_liveness_scores, attack_liveness_scores, 'higher_is_real')

    hsv_threshold, hsv_real_pass, hsv_attack_block, hsv_youden = \
        _find_optimal_threshold(real_saturation_scores, attack_saturation_scores, 'lower_is_real')

    # Determinar confiança
    confidence_level = _confidence_level(len(real_valid), len(attack_valid))

    # Gerar interpretações
    liveness_interpretation = _generate_interpretation_liveness(
        "liveness",
        liveness_threshold,
        liveness_real_pass,
        liveness_attack_block,
        liveness_youden,
        confidence_level,
        len(real_valid),
        len(attack_valid),
    )

    hsv_interpretation = _generate_interpretation_hsv(
        hsv_threshold,
        hsv_real_pass,
        hsv_attack_block,
        hsv_youden,
        confidence_level,
    )

    # Montar análises
    liveness_analysis = ThresholdAnalysis(
        metric="liveness",
        suggested_value=round(float(liveness_threshold), 2),
        real_pass_rate=liveness_real_pass,
        attack_block_rate=liveness_attack_block,
        youden_score=liveness_youden,
        confidence=confidence_level,
        interpretation=liveness_interpretation,
    )

    hsv_analysis = ThresholdAnalysis(
        metric="hsv_saturation",
        suggested_value=round(float(hsv_threshold), 1),
        real_pass_rate=hsv_real_pass,
        attack_block_rate=hsv_attack_block,
        youden_score=hsv_youden,
        confidence=confidence_level,
        interpretation=hsv_interpretation,
    )

    # Thresholds sugeridos
    suggested_thresholds = ThresholdConfig(
        liveness=round(float(liveness_threshold), 2),
        hsv_saturation_max=round(float(hsv_threshold), 1),
        recognition=1.10,
        liveness_v1_weight=0.40,
        liveness_v2_weight=0.60,
        hsv_saturation_std_min=45.0,
        detection_score_min=0.75,
    )

    # Gerar aviso se necessário
    warning = None
    if len(real_valid) < 3 or len(attack_valid) < 3:
        warning = "Menos de 3 amostras válidas em algum grupo. Resultado não confiável — capture mais amostras."
    elif liveness_youden < 0.3 and hsv_youden < 0.3:
        warning = "Os grupos reais e ataques têm scores muito similares. O sistema pode ter dificuldade em " \
                  "distingui-los neste ambiente. Verifique a iluminação e a qualidade das imagens."
    elif len(real_results) - len(real_valid) > len(real_results) * 0.5:
        warning = "Mais da metade das imagens reais não tiveram face detectada. Verifique a qualidade das fotos."

    # Overall interpretation
    overall_interpretation = (
        f"Calibração concluída com {len(real_valid)} amostras reais e {len(attack_valid)} amostras "
        f"de ataque válidas. O threshold de liveness sugerido é {suggested_thresholds.liveness:.2f} "
        f"({liveness_real_pass * 100:.0f}% de pessoas reais passam, {liveness_attack_block * 100:.0f}% "
        f"de ataques bloqueados). O threshold HSV sugerido é {suggested_thresholds.hsv_saturation_max:.1f}. "
        f"Aplique os thresholds sugeridos e monitore os primeiros reconhecimentos para confirmar "
        f"os resultados no seu ambiente."
    )

    return CalibrateResponse(
        samples=all_samples,
        liveness_analysis=liveness_analysis,
        hsv_analysis=hsv_analysis,
        suggested_thresholds=suggested_thresholds,
        total_samples=len(all_samples),
        real_samples_processed=len(real_valid),
        attack_samples_processed=len(attack_valid),
        real_samples_failed=len(real_results) - len(real_valid),
        attack_samples_failed=len(attack_results) - len(attack_valid),
        overall_interpretation=overall_interpretation,
        warning=warning,
    )


# ============================================================================
# CALIBRAÇÃO DE THRESHOLD DE RECONHECIMENTO
# ============================================================================

async def _extract_face_embedding(
    file: UploadFile,
    label: Literal['same_person', 'other_person'],
    face_detector,
    face_embedder,
) -> tuple[Optional[np.ndarray], RecognitionSampleResult]:
    """
    Detecta face em uma imagem e extrai embedding L2-normalizado.

    Returns:
        (embedding ou None, RecognitionSampleResult com status do processamento)
    """
    try:
        content = await file.read()
        image_array = cv2.imdecode(
            np.frombuffer(content, np.uint8),
            cv2.IMREAD_COLOR,
        )
        if image_array is None:
            return None, RecognitionSampleResult(
                label=label, face_detected=False, error="Imagem inválida ou não decodificável"
            )

        all_faces = face_detector.detect_all_faces(image_array, min_det_score=0.50)
        if len(all_faces) == 0:
            return None, RecognitionSampleResult(
                label=label, face_detected=False, error="Nenhuma face detectada"
            )

        face_data = all_faces[0]
        embedding = face_embedder.extract_embedding(face_data["embedding"])
        return embedding, RecognitionSampleResult(label=label, face_detected=True)

    except Exception as exc:
        return None, RecognitionSampleResult(
            label=label, face_detected=False, error=f"Erro: {str(exc)[:100]}"
        )


def _generate_interpretation_recognition(
    threshold: float,
    genuine_pass_rate: float,
    impostor_block_rate: float,
    youden_score: float,
    confidence: Literal['low', 'medium', 'high'],
    genuine_distances: list[float],
    impostor_distances: list[float],
) -> str:
    """Gera interpretação em português para calibração de threshold de reconhecimento."""
    parts = []

    has_overlap = (
        len(genuine_distances) > 0
        and len(impostor_distances) > 0
        and max(genuine_distances) > min(impostor_distances)
    )

    if genuine_pass_rate >= 0.95 and impostor_block_rate >= 0.90:
        parts.append(
            f"Excelente separação de identidade. Com threshold {threshold:.3f}, "
            f"{genuine_pass_rate * 100:.0f}% das fotos da mesma pessoa são reconhecidas "
            f"e {impostor_block_rate * 100:.0f}% de impostores são bloqueados."
        )
    elif genuine_pass_rate < 0.80:
        parts.append(
            f"Threshold restritivo — apenas {genuine_pass_rate * 100:.0f}% das fotos da "
            f"mesma pessoa seriam reconhecidas. A pessoa pode ter dificuldade de ser identificada. "
            f"Considere fotos com melhor qualidade ou iluminação mais uniforme."
        )
    elif impostor_block_rate < 0.80:
        parts.append(
            f"Separação fraca entre identidades — apenas {impostor_block_rate * 100:.0f}% de "
            f"impostores seriam bloqueados. Use fotos mais diversas de outras pessoas para calibrar."
        )
    else:
        parts.append(
            f"Boa separação de identidade. Com threshold {threshold:.3f}, "
            f"{genuine_pass_rate * 100:.0f}% de reconhecimentos corretos e "
            f"{impostor_block_rate * 100:.0f}% de impostores bloqueados."
        )

    if has_overlap:
        parts.append(
            " As distribuições de distância se sobrepõem levemente — isso é normal "
            "em condições variadas de captura."
        )

    if confidence == 'low':
        parts.append(" ⚠️ Poucas amostras — resultado indicativo.")

    return "".join(parts)


@router.post("/calibrate/recognition", response_model=RecognitionCalibrateResponse)
async def calibrate_recognition(
    same_person_images: list[UploadFile] = File(...),
    other_person_images: list[UploadFile] = File(...),
) -> RecognitionCalibrateResponse:
    """
    Calibra o threshold de reconhecimento analisando distribuições de distância L2.

    **Abordagem:**
    - Computa todas as distâncias L2 entre pares da mesma pessoa (distribuição genuína)
    - Computa todas as distâncias L2 entre a mesma pessoa e outras pessoas (distribuição impostora)
    - Encontra o threshold que maximiza a métrica ponderada: 0.7 × taxa_reconhecimento + 0.3 × taxa_bloqueio

    Isso é mais robusto do que comparar contra um embedding fixo, pois considera
    a variação natural das fotos da mesma pessoa.

    Args:
        same_person_images: 2-20 fotos da mesma pessoa a ser reconhecida
        other_person_images: 1-20 fotos de pessoas diferentes (impostores)

    Returns:
        RecognitionCalibrateResponse com threshold sugerido e estatísticas de distância
    """
    from app.main import face_detector, face_embedder

    if len(same_person_images) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mínimo 2 fotos da mesma pessoa para calcular pares genuínos",
        )
    if len(other_person_images) < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mínimo 1 foto de outra pessoa para calcular distâncias impostoras",
        )
    if len(same_person_images) > 20 or len(other_person_images) > 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Máximo 20 imagens de cada tipo",
        )

    # Extrair embeddings em paralelo
    same_tasks = [
        _extract_face_embedding(img, 'same_person', face_detector, face_embedder)
        for img in same_person_images
    ]
    other_tasks = [
        _extract_face_embedding(img, 'other_person', face_detector, face_embedder)
        for img in other_person_images
    ]

    same_results = await asyncio.gather(*same_tasks)
    other_results = await asyncio.gather(*other_tasks)

    same_embeddings = [emb for emb, _ in same_results if emb is not None]
    other_embeddings = [emb for emb, _ in other_results if emb is not None]

    same_valid = len(same_embeddings)
    other_valid = len(other_embeddings)

    if same_valid < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Apenas {same_valid} foto(s) válida(s) da mesma pessoa. Precisamos de pelo menos 2.",
        )
    if other_valid < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhuma face detectada nas fotos de outras pessoas.",
        )

    # Distâncias genuínas: todos os pares (i, j) da mesma pessoa, i < j
    genuine_distances = [
        float(np.linalg.norm(same_embeddings[i] - same_embeddings[j]))
        for i in range(len(same_embeddings))
        for j in range(i + 1, len(same_embeddings))
    ]

    # Distâncias impostoras: cada embedding da mesma pessoa vs cada outro
    impostor_distances = [
        float(np.linalg.norm(same_emb - other_emb))
        for same_emb in same_embeddings
        for other_emb in other_embeddings
    ]

    # Threshold ótimo com métrica ponderada (direction=lower_is_real: passa se dist <= threshold)
    threshold, genuine_pass_rate, impostor_block_rate, youden_score = \
        _find_optimal_threshold(genuine_distances, impostor_distances, 'lower_is_real')

    confidence_level = _confidence_level(same_valid, other_valid)

    interpretation = _generate_interpretation_recognition(
        threshold,
        genuine_pass_rate,
        impostor_block_rate,
        youden_score,
        confidence_level,
        genuine_distances,
        impostor_distances,
    )

    recognition_analysis = ThresholdAnalysis(
        metric="recognition",
        suggested_value=round(float(threshold), 3),
        real_pass_rate=genuine_pass_rate,
        attack_block_rate=impostor_block_rate,
        youden_score=youden_score,
        confidence=confidence_level,
        interpretation=interpretation,
    )

    genuine_mean = float(np.mean(genuine_distances)) if genuine_distances else 0.0
    impostor_mean = float(np.mean(impostor_distances)) if impostor_distances else 0.0

    warning = None
    if same_valid < 3:
        warning = (
            f"Apenas {same_valid} foto(s) válida(s) — use pelo menos 5 fotos para maior precisão. "
            "Inclua variações de ângulo e iluminação."
        )
    elif youden_score < 0.3:
        warning = (
            "As distribuições de distância genuína e impostora se sobrepõem muito. "
            "Tente capturar fotos com mais variações de ângulo/iluminação da mesma pessoa, "
            "e use fotos de outras pessoas mais distintas."
        )

    overall_interpretation = (
        f"Calibração de reconhecimento concluída com {same_valid} fotos válidas da mesma pessoa "
        f"e {other_valid} de outras pessoas. "
        f"Distância média genuine: {genuine_mean:.3f} | Distância média impostora: {impostor_mean:.3f}. "
        f"Threshold sugerido: {threshold:.3f} "
        f"({genuine_pass_rate * 100:.0f}% reconhecidos, {impostor_block_rate * 100:.0f}% impostores bloqueados)."
    )

    return RecognitionCalibrateResponse(
        recognition_analysis=recognition_analysis,
        suggested_threshold=round(float(threshold), 3),
        genuine_distances=[round(d, 4) for d in genuine_distances],
        impostor_distances=[round(d, 4) for d in impostor_distances],
        same_person_valid=same_valid,
        other_person_valid=other_valid,
        genuine_pairs_analyzed=len(genuine_distances),
        impostor_pairs_analyzed=len(impostor_distances),
        genuine_mean=round(genuine_mean, 4),
        impostor_mean=round(impostor_mean, 4),
        overall_interpretation=overall_interpretation,
        warning=warning,
    )
