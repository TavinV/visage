"""
Análise de saturação HSV para detecção de telas (anti-spoofing complementar).

Telas de celular e monitores tendem a produzir saturação alta e uniforme
na região da face — padrão diferente de pele humana real.

Esta análise NÃO bloqueia o reconhecimento sozinha. Ela é usada como sinal
complementar ao MiniFASNet: se o MiniFASNet aprova mas o HSV é suspeito
e o score estiver abaixo de (threshold × 1.2), a requisição é bloqueada.
"""

import cv2
import numpy as np
from typing import Tuple


def analyze_screen_saturation(
    frame_bgr: np.ndarray,
    bbox: np.ndarray,
) -> Tuple[bool, float]:
    """
    Analisa a saturação HSV da região da face para detectar telas.

    Telas tendem a ter saturação média mais alta e distribuição mais estreita
    que pele humana real. Isso ocorre porque pixels de tela são gerados por
    sub-pixels RGB puros, enquanto pele humana tem variação orgânica de cor.

    Limiares empíricos:
        saturation_mean > 140  → saturação muito alta (padrão de tela)
        saturation_std  < 45   → distribuição estreita (uniforme como display)
        Ambos devem ser verdadeiros para considerar suspeito.

    Esta função NÃO bloqueia sozinha — combinar com liveness_score para
    decisão final (ver routers/recognize.py).

    Args:
        frame_bgr: Frame BGR completo (não o crop).
        bbox:      Bounding box [x1, y1, x2, y2] da face detectada.

    Returns:
        (is_suspicious, saturation_mean)
        is_suspicious: True se os limiares de tela forem atingidos.
        saturation_mean: Média da saturação HSV no crop (0–255).
    """
    h, w = frame_bgr.shape[:2]
    x1, y1, x2, y2 = bbox[:4]

    # Crop com padding 1.5× — inclui contexto ao redor da face
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    half_w = (x2 - x1) * 1.5 / 2.0
    half_h = (y2 - y1) * 1.5 / 2.0

    nx1 = max(0, int(cx - half_w))
    ny1 = max(0, int(cy - half_h))
    nx2 = min(w, int(cx + half_w))
    ny2 = min(h, int(cy + half_h))

    crop = frame_bgr[ny1:ny2, nx1:nx2]
    if crop.size == 0:
        # Fallback: bbox original
        crop = frame_bgr[max(0, int(y1)):min(h, int(y2)),
                         max(0, int(x1)):min(w, int(x2))]

    if crop.size == 0:
        return False, 0.0

    # Converter para HSV e extrair canal S (saturação)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1].astype(np.float32)

    saturation_mean = float(saturation.mean())
    saturation_std  = float(saturation.std())

    # Tela: saturação alta E distribuição estreita (uniforme)
    is_suspicious = (saturation_mean > 140.0) and (saturation_std < 45.0)

    return is_suspicious, saturation_mean
