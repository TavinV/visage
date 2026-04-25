"""
Detecção avançada de liveness (anti-replay/anti-print) via análise multi-frame.

Módulo puramente funcional — sem estado global, sem I/O, sem dependências externas
além de NumPy e OpenCV.

Estratégias implementadas:
  1. Análise de movimento temporal  — detecta foto/tela estática
  2. Variância de embeddings         — detecta replay com frame repetido
  3. Detector de padrão de tela (FFT/Moiré) — detecta pixel grid de display

Uso básico:
    from core.liveness_advanced import compute_liveness

    result = compute_liveness(frames, embeddings)
    if not result["is_live"]:
        # bloquear acesso
        ...
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thresholds heurísticos — ajuste conforme ambiente de produção
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LivenessThresholds:
    """
    Todos os limiares em um único ponto de configuração.

    Altere apenas aqui; nenhuma outra parte do código precisa ser tocada.
    """
    # Movimento mínimo entre frames (pixels normalizados 0–1)
    # Valores abaixo disso indicam imagem estática (foto/tela parada)
    motion_min: float = 0.02

    # Variância mínima de embeddings consecutivos
    # Valor muito baixo indica replay com frame repetido ou vídeo congelado
    embedding_variance_min: float = 0.01

    # Ratio máximo FFT outer/center aceitável para face real
    # Valores altos indicam padrões periódicos de tela (Moiré)
    fft_ratio_max: float = 0.6

    # Confidence mínima para is_live = True
    liveness_confidence_min: float = 0.5

    # Pesos da média ponderada final
    weight_motion: float = 0.40
    weight_embedding: float = 0.40
    weight_fft: float = 0.20


# Instância global padrão — substitua por instância customizada se necessário
DEFAULT_THRESHOLDS = LivenessThresholds()


# ---------------------------------------------------------------------------
# Parte 1 — Análise de movimento temporal
# ---------------------------------------------------------------------------

def analyze_motion(frames: List[np.ndarray]) -> float:
    """
    Estima o nível de movimento real entre frames consecutivos.

    Estratégia:
      - Converter cada frame para escala de cinza
      - Calcular diferença absoluta média entre frames adjacentes
      - Normalizar para [0, 1] usando heurística baseada em pixel range

    Args:
        frames: Lista de 2+ imagens (BGR ou RGB) com dtype uint8 ou float32.
                Devem ter o mesmo shape; caso contrário são redimensionadas
                para o shape do primeiro frame.

    Returns:
        motion_score em [0.0, 1.0]:
          - ~0.0 → sem movimento (foto estática, tela congelada)
          - ~1.0 → movimento intenso

    Raises:
        ValueError: Se menos de 2 frames forem fornecidos.
    """
    if len(frames) < 2:
        raise ValueError(f"analyze_motion requer >= 2 frames, recebeu {len(frames)}")

    # Normalização de shape: garantir que todos os frames sejam comparáveis
    target_h, target_w = frames[0].shape[:2]

    grays: List[np.ndarray] = []
    for i, f in enumerate(frames):
        # Redimensionar se necessário (tolerância para frames de tamanhos diferentes)
        if f.shape[:2] != (target_h, target_w):
            f = cv2.resize(f, (target_w, target_h), interpolation=cv2.INTER_AREA)

        # Converter para grayscale
        if f.ndim == 3:
            g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        else:
            g = f

        # Normalizar para float32 [0, 1] — evita overflow em uint8
        grays.append(g.astype(np.float32) / 255.0)

    # Diferença absoluta entre frames consecutivos (vetorizado)
    diffs = np.array([
        np.mean(np.abs(grays[i] - grays[i + 1]))
        for i in range(len(grays) - 1)
    ], dtype=np.float64)

    raw_motion = float(np.mean(diffs))

    # Normalização heurística: movimento "típico" de face real ≈ 0.03–0.08
    # Clampamos em 0.10 para não penalizar movimentos bruscos como score > 1
    motion_score = float(np.clip(raw_motion / 0.10, 0.0, 1.0))

    logger.debug("analyze_motion: raw=%.5f score=%.4f (n_diffs=%d)",
                 raw_motion, motion_score, len(diffs))

    return motion_score


# ---------------------------------------------------------------------------
# Parte 2 — Variância de embeddings
# ---------------------------------------------------------------------------

def analyze_embedding_variance(embeddings: List[np.ndarray]) -> float:
    """
    Avalia variação natural nos embeddings de múltiplos frames da mesma face.

    Uma face real apresenta micro-variações de pose, iluminação e expressão —
    seus embeddings consecutivos são similares mas NÃO idênticos.
    Um ataque de replay com frame estático ou vídeo em loop produz embeddings
    quase idênticos (similaridade coseno muito próxima de 1.0).

    Estratégia:
      - Calcular similaridade coseno entre embeddings consecutivos
      - Quanto MAIS similar → mais suspeito
      - Retornar score INVERTIDO: alta variação → score alto (genuine)

    Args:
        embeddings: Lista de 2+ vetores 1-D de embedding normalizados (L2).
                    Se não normalizados, a função normaliza internamente.

    Returns:
        variance_score em [0.0, 1.0]:
          - ~0.0 → embeddings idênticos (suspeito de replay)
          - ~1.0 → variação natural (genuine)

    Raises:
        ValueError: Se menos de 2 embeddings forem fornecidos.
    """
    if len(embeddings) < 2:
        raise ValueError(
            f"analyze_embedding_variance requer >= 2 embeddings, recebeu {len(embeddings)}"
        )

    # Normalizar embeddings (L2) para garantir similaridade coseno correta
    normed: List[np.ndarray] = []
    for e in embeddings:
        e = e.astype(np.float64).ravel()
        norm = np.linalg.norm(e)
        normed.append(e / (norm + 1e-10))

    # Similaridade coseno entre pares consecutivos
    cosine_sims = np.array([
        np.dot(normed[i], normed[i + 1])
        for i in range(len(normed) - 1)
    ], dtype=np.float64)

    mean_similarity = float(np.mean(cosine_sims))

    # Converter similaridade → "variância invertida"
    # similarity ≈ 1.0 → sem variação → score baixo (suspeito)
    # similarity ≈ 0.95 (variação natural 0.05) → score alto
    # Normalizar: variação esperada em rosto real ≈ 0.01–0.05 (1 - similarity)
    mean_variation = 1.0 - mean_similarity
    variance_score = float(np.clip(mean_variation / 0.05, 0.0, 1.0))

    logger.debug(
        "analyze_embedding_variance: mean_sim=%.5f variation=%.5f score=%.4f",
        mean_similarity, mean_variation, variance_score,
    )

    return variance_score


# ---------------------------------------------------------------------------
# Parte 3 — Detector de padrão de tela (FFT / Moiré)
# ---------------------------------------------------------------------------

def detect_screen_pattern(frame: np.ndarray) -> float:
    """
    Detecta padrões periódicos de pixel grid de displays (Moiré) via FFT 2D.

    Telas de celular/monitor possuem uma grade regular de sub-pixels que gera
    picos periódicos no espectro de frequência. Faces reais têm distribuição
    de frequências mais orgânica (sem picos periódicos dominantes).

    Estratégia:
      1. Converter para grayscale
      2. Aplicar FFT 2D e centralizar espectro (fftshift)
      3. Usar log-magnitude para comprimir dinâmica
      4. Comparar energia nas bordas (alta frequência) vs centro (baixa frequência)
         ratio = outer_mean / center_mean
      5. Normalizar ratio para [0, 1]: valor alto = provável tela

    Args:
        frame: Imagem BGR ou grayscale (uint8 ou float32).

    Returns:
        fft_score em [0.0, 1.0]:
          - ~0.0 → distribuição orgânica (face real)
          - ~1.0 → padrões periódicos fortes (tela de display)
    """
    # Converter para grayscale
    if frame.ndim == 3:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    else:
        gray = frame.astype(np.float32)

    # FFT 2D + shift para centralizar frequência zero
    f_transform = np.fft.fft2(gray)
    f_shifted = np.fft.fftshift(f_transform)

    # Log-magnitude: log(|F| + 1) para comprimir escala dinâmica
    magnitude = np.log(np.abs(f_shifted) + 1.0)

    h, w = magnitude.shape

    # Região central = baixas frequências (25% central em cada eixo)
    cy, cx = h // 2, w // 2
    quarter_h, quarter_w = h // 4, w // 4

    center_region = magnitude[
        cy - quarter_h: cy + quarter_h,
        cx - quarter_w: cx + quarter_w,
    ]

    # Região periférica = altas frequências (fora do centro)
    outer_mask = np.ones_like(magnitude, dtype=bool)
    outer_mask[cy - quarter_h: cy + quarter_h, cx - quarter_w: cx + quarter_w] = False

    center_mean = float(center_region.mean())
    outer_mean  = float(magnitude[outer_mask].mean())

    # Ratio outer/center: telas tendem a ter ratio mais alto
    ratio = outer_mean / (center_mean + 1e-10)

    # Normalizar: ratio típico de face real ≈ 0.3–0.5; tela ≈ 0.6–0.9+
    # Clamp em [0.2, 0.9] para evitar extremos artificiais antes de normalizar
    ratio_clamped = float(np.clip(ratio, 0.2, 0.9))
    fft_score = (ratio_clamped - 0.2) / (0.9 - 0.2)

    logger.debug(
        "detect_screen_pattern: center_mean=%.4f outer_mean=%.4f ratio=%.4f score=%.4f",
        center_mean, outer_mean, ratio, fft_score,
    )

    return float(np.clip(fft_score, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Parte 4 — Agregador principal
# ---------------------------------------------------------------------------

def compute_liveness(
    frames: List[np.ndarray],
    embeddings: List[np.ndarray],
    thresholds: LivenessThresholds = DEFAULT_THRESHOLDS,
) -> dict:
    """
    Combina as três análises em uma decisão de liveness final.

    Pipeline:
      1. analyze_motion         → score de movimento entre frames
      2. analyze_embedding_variance → variação natural de embeddings
      3. detect_screen_pattern  → presença de Moiré/pixel grid
      4. Média ponderada        → confidence final
      5. is_live = confidence > thresholds.liveness_confidence_min

    Args:
        frames:     Lista de 2+ frames BGR/RGB (mesma sessão de captura).
        embeddings: Lista de 2+ embeddings ArcFace correspondentes aos frames.
        thresholds: Instância de LivenessThresholds (usa DEFAULT_THRESHOLDS se omitido).

    Returns:
        dict com:
          - "is_live"    (bool)
          - "confidence" (float 0–1)
          - "scores"     (dict com motion, embedding_variance, fft_pattern)
          - "flags"      (dict com booleanos por critério — útil para debug/log)

    Raises:
        ValueError: Se frames ou embeddings tiverem menos de 2 elementos.
    """
    if len(frames) < 2:
        raise ValueError(f"compute_liveness requer >= 2 frames, recebeu {len(frames)}")
    if len(embeddings) < 2:
        raise ValueError(f"compute_liveness requer >= 2 embeddings, recebeu {len(embeddings)}")

    # --- Calcular scores individuais ---

    motion_score     = analyze_motion(frames)
    emb_var_score    = analyze_embedding_variance(embeddings)
    # FFT no primeiro frame (representativo da sessão)
    fft_score        = detect_screen_pattern(frames[0])

    # --- Flags booleanas por critério ---
    flag_motion    = motion_score     >= thresholds.motion_min
    flag_embedding = emb_var_score    >= thresholds.embedding_variance_min
    flag_fft       = fft_score        <= thresholds.fft_ratio_max

    # --- Confidence ponderada ---
    # fft_score alto = tela detectada → contribuição negativa: usar (1 - fft_score)
    confidence = float(
        motion_score  * thresholds.weight_motion +
        emb_var_score * thresholds.weight_embedding +
        (1.0 - fft_score) * thresholds.weight_fft
    )
    confidence = float(np.clip(confidence, 0.0, 1.0))

    is_live = confidence >= thresholds.liveness_confidence_min

    result = {
        "is_live": is_live,
        "confidence": round(confidence, 4),
        "scores": {
            "motion":              round(motion_score,  4),
            "embedding_variance":  round(emb_var_score, 4),
            "fft_pattern":         round(fft_score,     4),
        },
        "flags": {
            "motion_ok":    flag_motion,
            "embedding_ok": flag_embedding,
            "fft_ok":       flag_fft,
        },
    }

    logger.info(
        "compute_liveness: is_live=%s confidence=%.4f "
        "motion=%.4f emb_var=%.4f fft=%.4f",
        is_live, confidence,
        motion_score, emb_var_score, fft_score,
    )

    return result
