"""
Detecção de liveness (anti-spoofing) usando MiniFASNet V1 + V2 via ONNX.

Ensemble de dois modelos com escalas de crop diferentes:
  - MiniFASNetV1: crop 2.7× o bounding box
  - MiniFASNetV2: crop 4.0× o bounding box

Score final = 0.4 × score_v1 + 0.6 × score_v2

Os modelos esperam entrada uint8 [0-255] em CHW sem normalização.
"""

import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path
from typing import Tuple


class LivenessDetector:
    """
    Ensemble de MiniFASNetV1 (crop 2.7×) + MiniFASNetV2 (crop 4.0×).

    Score final = 0.4 × score_v1 + 0.6 × score_v2
    Os modelos esperam entrada float32 CHW com valores 0–255 (sem normalização).
    Output: (1, 3) — [background, real, fake]; índice 1 = score de face real.
    """

    # Escala de crop por modelo
    _SCALE_V1 = 2.7
    _SCALE_V2 = 4.0

    def __init__(self, model_v1_path: str, model_v2_path: str) -> None:
        """
        Carrega os dois modelos MiniFASNet ONNX.

        Args:
            model_v1_path: Caminho para 2.7_80x80_MiniFASNetV1.onnx
            model_v2_path: Caminho para 4_0_80x80_MiniFASNetV2.onnx

        Raises:
            FileNotFoundError: Se algum dos arquivos não existir
        """
        for path in (model_v1_path, model_v2_path):
            if not Path(path).exists():
                raise FileNotFoundError(f"Modelo ONNX não encontrado: {path}")

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 2
        providers = ["CPUExecutionProvider"]

        self._sess_v1 = ort.InferenceSession(str(model_v1_path), sess_options=opts, providers=providers)
        self._sess_v2 = ort.InferenceSession(str(model_v2_path), sess_options=opts, providers=providers)

        # Capturar nomes de entrada/saída uma única vez — evitar overhead por requisição
        self._in_v1  = self._sess_v1.get_inputs()[0].name
        self._in_v2  = self._sess_v2.get_inputs()[0].name
        self._out_v1 = self._find_cls_output(self._sess_v1)
        self._out_v2 = self._find_cls_output(self._sess_v2)

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def check(
        self,
        frame_bgr: np.ndarray,
        bbox: np.ndarray,
        threshold: float = 0.85,
        v1_weight: float = 0.40,
        v2_weight: float = 0.60,
    ) -> Tuple[bool, float, float, float]:
        """
        Verifica se a face no frame pertence a uma pessoa real com thresholds dinâmicos.

        Args:
            frame_bgr: Frame BGR completo (não o crop — o frame inteiro).
            bbox: Bounding box [x1, y1, x2, y2] retornado pelo SCRFD.
            threshold: Threshold de score de liveness (padrão 0.85).
            v1_weight: Peso do modelo V1 (padrão 0.40).
            v2_weight: Peso do modelo V2 (padrão 0.60).

        Returns:
            (is_live, score_combined, score_v1_raw, score_v2_raw)
            Os scores raw sempre são retornados independente do threshold.
        """
        score_v1 = self._infer(self._sess_v1, self._in_v1, self._out_v1,
                               frame_bgr, bbox, self._SCALE_V1)
        score_v2 = self._infer(self._sess_v2, self._in_v2, self._out_v2,
                               frame_bgr, bbox, self._SCALE_V2)

        score_combined = float(v1_weight * score_v1 + v2_weight * score_v2)
        score_combined = float(np.clip(score_combined, 0.0, 1.0))
        is_live = score_combined >= threshold

        return is_live, score_combined, float(score_v1), float(score_v2)

    # ------------------------------------------------------------------
    # Métodos internos
    # ------------------------------------------------------------------

    @staticmethod
    def _find_cls_output(session: ort.InferenceSession) -> str:
        """Retorna o nome da saída de classificação (shape [batch, n_classes])."""
        for out in session.get_outputs():
            if len(out.shape) == 2 and out.shape[1] in (2, 3):
                return out.name
        return session.get_outputs()[0].name

    @staticmethod
    def _crop(frame_bgr: np.ndarray, bbox: np.ndarray, scale: float) -> np.ndarray:
        """
        Extrai crop centralizado no bounding box com escala `scale`.

        Args:
            frame_bgr: Frame BGR completo.
            bbox:      [x1, y1, x2, y2].
            scale:     Fator de expansão (2.7 para V1, 4.0 para V2).

        Returns:
            Crop BGR 80×80.
        """
        h, w = frame_bgr.shape[:2]
        x1, y1, x2, y2 = bbox[:4]

        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        half_w = (x2 - x1) * scale / 2.0
        half_h = (y2 - y1) * scale / 2.0

        nx1 = max(0, int(cx - half_w))
        ny1 = max(0, int(cy - half_h))
        nx2 = min(w, int(cx + half_w))
        ny2 = min(h, int(cy + half_h))

        crop = frame_bgr[ny1:ny2, nx1:nx2]
        if crop.size == 0:
            crop = frame_bgr[max(0, int(y1)):min(h, int(y2)),
                             max(0, int(x1)):min(w, int(x2))]

        return cv2.resize(crop, (80, 80), interpolation=cv2.INTER_LINEAR)

    @staticmethod
    def _to_tensor(crop_bgr: np.ndarray) -> np.ndarray:
        """
        Converte crop BGR 80×80 para tensor (1, 3, 80, 80) float32.

        Os modelos MiniFASNet esperam valores 0–255 sem normalização.
        """
        return np.expand_dims(
            crop_bgr.astype(np.float32).transpose(2, 0, 1),
            axis=0,
        )

    def _infer(
        self,
        session: ort.InferenceSession,
        input_name: str,
        output_name: str,
        frame_bgr: np.ndarray,
        bbox: np.ndarray,
        scale: float,
    ) -> float:
        """
        Executa inferência em um modelo e retorna o score de face real.

        Output esperado shape (1, 3): [background, real, fake].
        Aplica softmax e retorna probs[1] (real).
        """
        crop   = self._crop(frame_bgr, bbox, scale)
        tensor = self._to_tensor(crop)
        logits = session.run([output_name], {input_name: tensor})[0][0].astype(np.float64)

        # Softmax estável numericamente
        exp_l = np.exp(logits - np.max(logits))
        probs = exp_l / exp_l.sum()

        # Índice 1 = real; índice 0 = background/fake dependendo do modelo
        # Se o modelo tiver apenas 2 classes ([fake, real]), índice 1 também é real
        return float(probs[1] if len(probs) >= 2 else probs[0])
