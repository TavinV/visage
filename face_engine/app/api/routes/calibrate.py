"""
Rota POST /calibrate para calibração e otimização de thresholds.

Processa amostras de pessoas reais e ataques, analisa os scores brutos,
e sugere thresholds otimizados usando o índice de Youden para balancear
sensibilidade e especificidade.
"""

import asyncio
from itertools import combinations
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
    PersonSummary,
    DistanceDistribution,
    RecognitionThresholdOption,
    ThresholdCurvePoint,
    HistogramBin,
    RocPoint,
    CalibrationChartData,
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
    tenant_id: str = None,  # Opcional para compatibilidade multi-tenant
    dek_ct: str = None,  # DEK criptografada (hex)
    dek_iv: str = None,  # IV da DEK (hex)
    dek_tag: str = None,  # Tag GCM da DEK (hex)
    dek_key_version: str = "1",  # Versão da chave
) -> CalibrateResponse:
    """
    Calibra thresholds para reconhecimento facial processando amostras reais e ataques.
    Suporta DEK per-tenant criptografada com MASTER_KEY.

    Aceita 1-20 imagens de cada tipo, processa para extrair scores brutos de cada
    componente (detection, liveness v1/v2, saturação HSV), e sugere thresholds
    otimizados usando índice de Youden.

    Args:
        real_images: 1-20 imagens de pessoas reais
        attack_images: 1-20 imagens de ataques (fotos de tela, impressas, etc)
        tenant_id: ID do tenant (opcional)
        dek_ct: DEK criptografada com MASTER_KEY (hex format)
        dek_iv: IV de 12 bytes da DEK (hex format)
        dek_tag: Tag de autenticação GCM (hex format)
        dek_key_version: Versão da MASTER_KEY usada para cifrar DEK

    Returns:
        CalibrateResponse com análise completa e thresholds sugeridos
    """
    from app.main import liveness_detector, face_detector, face_embedder, dek_manager

    # Descriptografar DEK se fornecida
    if tenant_id and dek_ct and dek_iv and dek_tag:
        try:
            dek_manager.decrypt_dek(
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
# HELPERS PARA CALIBRAÇÃO DE THRESHOLD DE RECONHECIMENTO
# ============================================================================

def _extract_person_id(filename: str) -> str:
    """
    Extrai o person_id do nome do arquivo usando o prefixo antes do último underscore.

    Exemplos:
        "joao_foto1.jpg"  → "joao"
        "maria_lado.jpg"  → "maria"
        "pessoa.jpg"      → "pessoa"
    """
    stem = Path(filename).stem
    parts = stem.rsplit('_', maxsplit=1)
    return parts[0] if len(parts) > 1 else stem


def _euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Distância euclidiana entre embeddings normalizados L2.
    Usa sqrt(2*(1-dot(a,b))) — equivalente e mais estável numericamente.
    Intervalo: 0.0 (idênticos) a 2.0 (opostos).
    """
    similarity = float(np.dot(a, b))
    return float(np.sqrt(2.0 * (1.0 - np.clip(similarity, -1.0, 1.0))))


def _compute_distribution(distances: list[float]) -> DistanceDistribution:
    """Calcula estatísticas descritivas de uma lista de distâncias."""
    arr = np.array(distances, dtype=np.float64)
    return DistanceDistribution(
        count=int(len(arr)),
        mean=float(np.mean(arr)),
        std=float(np.std(arr)),
        min=float(np.min(arr)),
        max=float(np.max(arr)),
        p5=float(np.percentile(arr, 5)),
        p25=float(np.percentile(arr, 25)),
        p50=float(np.percentile(arr, 50)),
        p75=float(np.percentile(arr, 75)),
        p95=float(np.percentile(arr, 95)),
    )


def _compute_dprime(
    genuine_dist: DistanceDistribution,
    impostor_dist: DistanceDistribution,
) -> float:
    """
    d-prime (d'): métrica de separabilidade entre distribuições.

    Valores de referência:
      < 1.0  → separação fraca
      1.0–2.0 → separação razoável
      2.0–3.0 → boa separação
      > 3.0  → excelente separação
    """
    pooled_std = float(np.sqrt(
        (genuine_dist.std ** 2 + impostor_dist.std ** 2) / 2.0
    ))
    if pooled_std == 0.0:
        return 0.0
    return float((impostor_dist.mean - genuine_dist.mean) / pooled_std)


def _compute_rates(
    threshold: float,
    genuine_distances: list[float],
    impostor_distances: list[float],
) -> tuple[float, float, float, float, float]:
    """
    Calcula taxas de aceitação/rejeição para um dado threshold.

    Returns:
        (genuine_accept_rate, impostor_reject_rate,
         false_rejection_rate, false_acceptance_rate, youden_score)
    """
    genuine_accept = sum(1 for d in genuine_distances if d <= threshold)
    impostor_reject = sum(1 for d in impostor_distances if d > threshold)

    gar = genuine_accept / len(genuine_distances)
    irr = impostor_reject / len(impostor_distances)
    frr = 1.0 - gar
    far = 1.0 - irr
    youden = gar + irr - 1.0

    return gar, irr, frr, far, youden


def _interpret_threshold_option(
    profile: Literal['conservative', 'balanced', 'liberal'],
    threshold: float,
    gar: float,
    irr: float,
    frr: float,
    far: float,
    youden: float,
) -> str:
    """Gera interpretação em português para uma opção de threshold."""
    if profile == 'conservative':
        base = (
            f"Threshold conservador ({threshold:.2f}): {gar:.0%} das verificações legítimas "
            f"são aceitas e {irr:.0%} dos impostores são bloqueados."
        )
        extras = []
        if frr > 0.15:
            extras.append(
                f" ⚠️ Taxa alta de rejeição de pessoas legítimas ({frr:.0%}) — "
                "alguns usuários podem ter dificuldade para se identificar."
            )
        if far > 0.05:
            extras.append(
                f" ⚠️ Ainda permite {far:.0%} de impostores — considere "
                "combinar com anti-spoofing rigoroso."
            )
        return base + "".join(extras)

    elif profile == 'balanced':
        base = (
            f"Threshold balanceado ({threshold:.2f}): melhor equilíbrio entre segurança "
            f"e conveniência. {gar:.0%} de aceitação legítima e {irr:.0%} de "
            "bloqueio de impostores."
        )
        extras = []
        if youden > 0.7:
            extras.append(" Boa separação entre os grupos.")
        elif youden < 0.4:
            extras.append(
                " ⚠️ Separação fraca — os grupos têm distribuições "
                "próximas neste ambiente."
            )
        return base + "".join(extras)

    else:  # liberal
        base = (
            f"Threshold liberal ({threshold:.2f}): prioriza conveniência. {gar:.0%} "
            f"de aceitação legítima, mas permite {far:.0%} de impostores."
        )
        extras = []
        if far > 0.10:
            extras.append(
                " ⚠️ Taxa de falsa aceitação elevada — recomendado apenas "
                "em ambientes de baixo risco ou combinado com outras camadas de segurança."
            )
        return base + "".join(extras)


def _compute_threshold_options(
    genuine_distances: list[float],
    impostor_distances: list[float],
    genuine_dist: DistanceDistribution,
    impostor_dist: DistanceDistribution,
) -> list[RecognitionThresholdOption]:
    """Calcula as três opções de threshold: conservador, balanceado e liberal."""
    # Conservador: percentil 95 das distâncias genuínas
    conservative = genuine_dist.p95

    # Balanceado: índice de Youden — maximiza sensitividade + especificidade - 1
    all_values = sorted(set(genuine_distances + impostor_distances))
    best_youden = -1.0
    balanced = conservative

    for t in all_values:
        genuine_accept = sum(1 for d in genuine_distances if d <= t) / len(genuine_distances)
        impostor_reject = sum(1 for d in impostor_distances if d > t) / len(impostor_distances)
        youden = genuine_accept + impostor_reject - 1.0
        if youden > best_youden:
            best_youden = youden
            balanced = t

    # Liberal: percentil 5 das distâncias impostoras
    liberal = impostor_dist.p5

    # Garantir ordenação: conservative <= balanced <= liberal
    conservative = min(conservative, balanced, liberal)
    liberal = max(conservative, balanced, liberal)
    balanced = sorted([conservative, balanced, liberal])[1]

    options: list[RecognitionThresholdOption] = []
    profiles: list[tuple[Literal['conservative', 'balanced', 'liberal'], str, float]] = [
        ('conservative', 'Conservador', conservative),
        ('balanced', 'Balanceado', balanced),
        ('liberal', 'Liberal', liberal),
    ]

    for profile, label, threshold in profiles:
        gar, irr, frr, far, youden = _compute_rates(threshold, genuine_distances, impostor_distances)
        interpretation = _interpret_threshold_option(profile, threshold, gar, irr, frr, far, youden)
        options.append(RecognitionThresholdOption(
            profile=profile,
            profile_label=label,
            threshold=round(threshold, 4),
            genuine_accept_rate=round(gar, 4),
            impostor_reject_rate=round(irr, 4),
            false_rejection_rate=round(frr, 4),
            false_acceptance_rate=round(far, 4),
            youden_score=round(youden, 4),
            interpretation=interpretation,
        ))

    return options


def _recommend_profile(
    dprime: float,
) -> Literal['conservative', 'balanced', 'liberal']:
    """
    Determina o perfil recomendado com base na separabilidade (d-prime).

    d' >= 2.0: boa separação → recomenda conservador
    1.0 <= d' < 2.0: separação razoável → recomenda balanceado
    d' < 1.0: separação fraca → recomenda liberal
    """
    if dprime >= 2.0:
        return 'conservative'
    elif dprime >= 1.0:
        return 'balanced'
    else:
        return 'liberal'


def _compute_warning_recognition(
    dprime: float,
    genuine_dist: DistanceDistribution,
    n_persons: int,
    confidence: Literal['low', 'medium', 'high'],
) -> Optional[str]:
    """Gera aviso baseado nas condições da calibração de reconhecimento."""
    if dprime < 0.5:
        return (
            f"Separação muito fraca entre pessoas legítimas e impostores (d'={dprime:.2f}). "
            "Os grupos têm distribuições de distância muito similares. Capture mais fotos "
            "variadas ou verifique se as imagens de impostores são suficientemente "
            "diferentes das legítimas."
        )
    if genuine_dist.std > 0.3:
        return (
            f"Alta variabilidade nas fotos legítimas (desvio padrão={genuine_dist.std:.3f}). "
            "Fotos com iluminação, ângulo ou qualidade muito diferentes podem estar "
            "distorcendo a calibração. Tente usar fotos mais homogêneas."
        )
    if n_persons < 3:
        return (
            f"Calibração baseada em apenas {n_persons} pessoas legítimas. Recomendado "
            "usar pelo menos 5 pessoas diferentes para uma calibração representativa do tenant."
        )
    if confidence == 'low':
        return (
            "Poucos pares de distância calculados. Capture mais fotos (mínimo 3 fotos por "
            "pessoa, mínimo 5 pessoas diferentes) para maior precisão."
        )
    return None


def _build_overall_interpretation(
    n_persons: int,
    n_impostors: int,
    dprime: float,
    eer: float,
    auc: float,
    recommended: RecognitionThresholdOption,
    confidence: Literal['low', 'medium', 'high'],
) -> str:
    """Gera diagnóstico completo da calibração de reconhecimento em português."""
    if dprime >= 3.0:
        quality = "excelente"
        ability = "distinguir facilmente"
    elif dprime >= 2.0:
        quality = "boa"
        ability = "distinguir bem"
    elif dprime >= 1.0:
        quality = "razoável"
        ability = "distinguir razoavelmente"
    else:
        quality = "fraca"
        ability = "distinguir com dificuldade"

    if auc >= 0.95:
        auc_label = "excelente (AUC={:.3f})".format(auc)
    elif auc >= 0.85:
        auc_label = "boa (AUC={:.3f})".format(auc)
    elif auc >= 0.70:
        auc_label = "razoável (AUC={:.3f})".format(auc)
    else:
        auc_label = "fraca (AUC={:.3f})".format(auc)

    eer_pct = eer * 100
    if eer_pct <= 5:
        eer_label = "muito baixa ({:.1f}%) — sistema altamente preciso".format(eer_pct)
    elif eer_pct <= 10:
        eer_label = "baixa ({:.1f}%) — sistema preciso".format(eer_pct)
    elif eer_pct <= 20:
        eer_label = "moderada ({:.1f}%) — desempenho aceitável".format(eer_pct)
    else:
        eer_label = "alta ({:.1f}%) — separação insuficiente".format(eer_pct)

    gar = recommended.genuine_accept_rate
    irr = recommended.impostor_reject_rate
    frr = recommended.false_rejection_rate
    far = recommended.false_acceptance_rate

    confidence_note = ""
    if confidence == 'low':
        confidence_note = (
            " ⚠️ Confiança baixa por número reduzido de pares — os valores acima são indicativos."
        )
    elif confidence == 'medium':
        confidence_note = " Confiança média — resultados confiáveis mas recomenda-se mais amostras."

    return (
        f"Calibração concluída com {n_persons} pessoas legítimas e {n_impostors} impostores "
        f"({recommended.genuine_accept_rate.__class__.__name__} omitido — ver métricas abaixo).\n\n"
        f"Separabilidade entre os grupos: {quality} (d'={dprime:.2f}). "
        f"A curva ROC é {auc_label} e a taxa de erro de equilíbrio (EER) é {eer_label}. "
        f"Isso indica que o sistema consegue {ability} pessoas legítimas de impostores neste ambiente.\n\n"
        f"Threshold recomendado: {recommended.threshold:.4f} (perfil {recommended.profile_label}) — "
        f"{gar:.0%} de aceitação de pessoas legítimas, {irr:.0%} de bloqueio de impostores, "
        f"FRR={frr:.0%} (legítimos rejeitados), FAR={far:.0%} (impostores aceitos).\n\n"
        f"Para aplicar, envie esse valor como 'recognition' no campo 'thresholds' "
        f"das requisições de reconhecimento.{confidence_note}"
    )


# ============================================================================
# HELPERS DE GRÁFICOS E MÉTRICAS AVANÇADAS
# ============================================================================

def _compute_eer(
    genuine_distances: list[float],
    impostor_distances: list[float],
) -> tuple[float, float]:
    """
    Calcula o Equal Error Rate (EER) — ponto onde FAR ≈ FRR.

    Returns:
        (eer_value, eer_threshold)
    """
    all_min = min(min(genuine_distances), min(impostor_distances))
    all_max = max(max(genuine_distances), max(impostor_distances))
    candidates = np.linspace(all_min, all_max, 1000)

    min_diff = float('inf')
    eer_value = 0.5
    eer_threshold = float(candidates[len(candidates) // 2])

    for t in candidates:
        far = sum(1 for d in impostor_distances if d <= t) / len(impostor_distances)
        frr = sum(1 for d in genuine_distances if d > t) / len(genuine_distances)
        diff = abs(far - frr)
        if diff < min_diff:
            min_diff = diff
            eer_value = (far + frr) / 2.0
            eer_threshold = float(t)

    return round(eer_value, 4), round(eer_threshold, 4)


def _build_threshold_curve(
    genuine_distances: list[float],
    impostor_distances: list[float],
    n_points: int = 100,
) -> list[ThresholdCurvePoint]:
    """Constrói curva de métricas em função do threshold — 100 pontos uniformes."""
    all_min = min(min(genuine_distances), min(impostor_distances))
    all_max = max(max(genuine_distances), max(impostor_distances))
    thresholds = np.linspace(all_min, all_max, n_points)

    points: list[ThresholdCurvePoint] = []
    for t in thresholds:
        gar, irr, frr, far, youden = _compute_rates(float(t), genuine_distances, impostor_distances)
        points.append(ThresholdCurvePoint(
            threshold=round(float(t), 4),
            genuine_accept_rate=round(gar, 4),
            impostor_reject_rate=round(irr, 4),
            false_rejection_rate=round(frr, 4),
            false_acceptance_rate=round(far, 4),
            youden_score=round(youden, 4),
        ))
    return points


def _build_roc_and_auc(
    threshold_curve: list[ThresholdCurvePoint],
) -> tuple[list[RocPoint], float]:
    """
    Constrói curva ROC (FAR × TAR) e calcula AUC pela regra trapezoidal.

    Returns:
        (roc_points, auc)
    """
    sorted_pts = sorted(threshold_curve, key=lambda p: p.false_acceptance_rate)
    roc_points = [
        RocPoint(
            false_acceptance_rate=p.false_acceptance_rate,
            genuine_accept_rate=p.genuine_accept_rate,
            threshold=p.threshold,
        )
        for p in sorted_pts
    ]

    auc = 0.0
    for i in range(1, len(roc_points)):
        dx = roc_points[i].false_acceptance_rate - roc_points[i - 1].false_acceptance_rate
        avg_y = (roc_points[i].genuine_accept_rate + roc_points[i - 1].genuine_accept_rate) / 2.0
        auc += dx * avg_y

    return roc_points, round(float(auc), 4)


def _build_histogram(
    genuine_distances: list[float],
    impostor_distances: list[float],
    n_bins: int = 25,
) -> list[HistogramBin]:
    """Constrói histograma com bins sobrepostos para as duas distribuições."""
    all_min = min(min(genuine_distances), min(impostor_distances))
    all_max = max(max(genuine_distances), max(impostor_distances))
    margin = (all_max - all_min) * 0.05
    bin_min = all_min - margin
    bin_max = all_max + margin
    bin_width = (bin_max - bin_min) / n_bins

    bins: list[HistogramBin] = []
    for i in range(n_bins):
        start = bin_min + i * bin_width
        end = start + bin_width
        genuine_count = sum(1 for d in genuine_distances if start <= d < end)
        impostor_count = sum(1 for d in impostor_distances if start <= d < end)
        bins.append(HistogramBin(
            range_start=round(start, 4),
            range_end=round(end, 4),
            genuine_count=genuine_count,
            impostor_count=impostor_count,
        ))
    return bins


async def _extract_embeddings_from_files(
    files: list[UploadFile],
    detector,
    embedder,
) -> tuple[list[list[float]], int]:
    """
    Processa uma lista de UploadFile e extrai embeddings L2-normalizados.

    Returns:
        (embeddings_extraídos, count_falhas)
        Imagens sem face detectada são ignoradas e contadas em falhas.
        Nunca lança exceção por imagem individual.
    """
    async def _process_one(file: UploadFile) -> Optional[list[float]]:
        try:
            content = await file.read()
            image_array = cv2.imdecode(
                np.frombuffer(content, np.uint8),
                cv2.IMREAD_COLOR,
            )
            if image_array is None:
                return None
            all_faces = detector.detect_all_faces(image_array, min_det_score=0.60)
            if len(all_faces) == 0:
                return None
            face_data = all_faces[0]
            embedding = embedder.extract_embedding(face_data["embedding"])
            return [float(x) for x in embedding.tolist()]
        except Exception:
            return None

    results = await asyncio.gather(*[_process_one(f) for f in files])
    embeddings: list[list[float]] = [r for r in results if r is not None]
    failures = sum(1 for r in results if r is None)
    return embeddings, failures


# ============================================================================
# ROTA POST /calibrate/recognition
# ============================================================================

@router.post("/calibrate/recognition", response_model=RecognitionCalibrateResponse)
async def calibrate_recognition(
    legitimate_images: list[UploadFile] = File(...),
    impostor_images: list[UploadFile] = File(...),
    tenant_id: str = None,  # Opcional para compatibilidade multi-tenant
    dek_ct: str = None,  # DEK criptografada (hex)
    dek_iv: str = None,  # IV da DEK (hex)
    dek_tag: str = None,  # Tag GCM da DEK (hex)
    dek_key_version: str = "1",  # Versão da chave
) -> RecognitionCalibrateResponse:
    """
    Calibra o threshold de reconhecimento facial para um tenant.
    Suporta DEK per-tenant criptografada com MASTER_KEY.

    Processa fotos de pessoas legítimas (agrupadas por prefixo de nome) e fotos
    de impostores, calcula distribuições de distância euclidiana entre embeddings
    ArcFace e sugere três perfis de threshold: conservador, balanceado e liberal.

    O agrupamento usa o prefixo antes do último underscore do nome do arquivo:
    "joao_foto1.jpg" e "joao_foto2.jpg" pertencem à mesma pessoa "joao".

    Args:
        legitimate_images: 4-20 fotos das pessoas legítimas do tenant
        impostor_images: 3-20 fotos de impostores (pessoas fora do tenant)
        tenant_id: ID do tenant (opcional)
        dek_ct: DEK criptografada com MASTER_KEY (hex format)
        dek_iv: IV de 12 bytes da DEK (hex format)
        dek_tag: Tag de autenticação GCM (hex format)
        dek_key_version: Versão da MASTER_KEY usada para cifrar DEK

    Returns:
        RecognitionCalibrateResponse com distribuições, d-prime e três opções de threshold
    """
    from app.main import face_detector, face_embedder, dek_manager

    # Descriptografar DEK se fornecida
    if tenant_id and dek_ct and dek_iv and dek_tag:
        try:
            dek_manager.decrypt_dek(
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

    VALID_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}

    # Passo 1: Validação básica
    if len(legitimate_images) < 4:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mínimo 4 imagens legítimas (2 pessoas × 2 fotos cada).",
        )
    if len(legitimate_images) > 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Máximo 20 imagens legítimas.",
        )
    if len(impostor_images) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mínimo 3 imagens de impostores.",
        )
    if len(impostor_images) > 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Máximo 20 imagens de impostores.",
        )

    for file in legitimate_images + impostor_images:
        if file.content_type not in VALID_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Arquivo '{file.filename}' tem tipo inválido '{file.content_type}'. "
                    "Apenas JPEG e PNG são aceitos."
                ),
            )

    # Passo 2: Agrupar imagens legítimas por pessoa via prefixo de nome
    person_files: dict[str, list[UploadFile]] = {}
    for file in legitimate_images:
        person_id = _extract_person_id(file.filename or "unknown")
        person_files.setdefault(person_id, []).append(file)

    if len(person_files) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Imagens legítimas devem representar pelo menos 2 pessoas diferentes. "
                "Use prefixos diferentes no nome dos arquivos: pessoa1_foto1.jpg, pessoa2_foto1.jpg"
            ),
        )

    # Passo 3: Extrair embeddings por pessoa (estrutura interna com embeddings)
    persons_internal: list[dict] = []
    for person_id, files in person_files.items():
        embs, failed = await _extract_embeddings_from_files(files, face_detector, face_embedder)
        persons_internal.append({
            "person_id": person_id,
            "embeddings": embs,
            "photo_count": len(embs),
            "failed_photos": failed,
        })

    # Extrair embeddings de impostores
    impostor_embeddings, impostor_failed = await _extract_embeddings_from_files(
        impostor_images, face_detector, face_embedder
    )
    impostor_count = len(impostor_embeddings)

    # Passo 4: Calcular distâncias intra-classe (genuine)
    genuine_distances: list[float] = []
    for person in persons_internal:
        if len(person["embeddings"]) >= 2:
            for emb_a, emb_b in combinations(person["embeddings"], 2):
                dist = _euclidean_distance(np.array(emb_a), np.array(emb_b))
                genuine_distances.append(dist)

    # Passo 5: Calcular distâncias inter-classe (impostor)
    all_legit_embeddings = [emb for person in persons_internal for emb in person["embeddings"]]
    impostor_distances: list[float] = []
    for imp_emb in impostor_embeddings:
        for legit_emb in all_legit_embeddings:
            dist = _euclidean_distance(np.array(imp_emb), np.array(legit_emb))
            impostor_distances.append(dist)

    # Passo 6: Validar que há dados suficientes
    if len(genuine_distances) < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Nenhum par legítimo calculado. Certifique-se de que pelo menos "
                "2 pessoas têm 2 ou mais fotos com face detectada."
            ),
        )
    if len(impostor_distances) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Menos de 3 distâncias de impostores calculadas. Verifique se "
                "as fotos de impostores têm faces detectáveis."
            ),
        )

    # Passo 7: Calcular distribuições e d-prime
    genuine_dist = _compute_distribution(genuine_distances)
    impostor_dist = _compute_distribution(impostor_distances)
    dprime = _compute_dprime(genuine_dist, impostor_dist)

    # Passo 8: Calcular as três opções de threshold
    options = _compute_threshold_options(
        genuine_distances, impostor_distances, genuine_dist, impostor_dist
    )

    # Passo 9-10: Determinar recomendação
    recommended_profile = _recommend_profile(dprime)
    recommended = next(o for o in options if o.profile == recommended_profile)

    # Passo 11: Confidence e warning
    min_pairs = min(len(genuine_distances), len(impostor_distances))
    if min_pairs < 3:
        confidence: Literal['low', 'medium', 'high'] = 'low'
    elif min_pairs < 10:
        confidence = 'medium'
    else:
        confidence = 'high'

    n_persons = len(persons_internal)
    warning = _compute_warning_recognition(dprime, genuine_dist, n_persons, confidence)

    # Métricas avançadas: EER, curva ROC, AUC
    eer_value, eer_threshold = _compute_eer(genuine_distances, impostor_distances)
    threshold_curve = _build_threshold_curve(genuine_distances, impostor_distances)
    roc_curve, auc = _build_roc_and_auc(threshold_curve)
    histogram = _build_histogram(genuine_distances, impostor_distances)

    chart_data = CalibrationChartData(
        threshold_curve=threshold_curve,
        histogram=histogram,
        roc_curve=roc_curve,
        eer_threshold=eer_threshold,
        eer_value=eer_value,
    )

    # Passo 12: Diagnóstico geral enriquecido
    overall = _build_overall_interpretation(
        n_persons, impostor_count, dprime, eer_value, auc, recommended, confidence
    )

    # Montar resumo das pessoas sem embeddings
    persons_summary = [
        PersonSummary(
            person_id=p["person_id"],
            photo_count=p["photo_count"],
            failed_photos=p["failed_photos"],
        )
        for p in persons_internal
    ]

    return RecognitionCalibrateResponse(
        persons_processed=persons_summary,
        impostor_count=impostor_count,
        impostor_failed=impostor_failed,
        genuine_distribution=genuine_dist,
        impostor_distribution=impostor_dist,
        dprime=round(dprime, 4),
        eer=eer_value,
        auc=auc,
        options=options,
        recommended_profile=recommended_profile,
        recommended_threshold=recommended.threshold,
        total_genuine_pairs=len(genuine_distances),
        total_impostor_pairs=len(impostor_distances),
        confidence=confidence,
        warning=warning,
        overall_interpretation=overall,
        chart_data=chart_data,
    )

