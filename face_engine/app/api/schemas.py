"""
Schemas Pydantic para a API Face Recognition Engine.
Inclui schemas para reconhecimento dinâmico com thresholds customizáveis
e calibração automática de thresholds.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal


# ============================================================================
# SCHEMAS DE RECONHECIMENTO
# ============================================================================

class ThresholdConfig(BaseModel):
    """
    Configuração de thresholds dinâmicos para o pipeline de reconhecimento.
    Todos os valores são validados com limites razoáveis.
    Os pesos de liveness v1 + v2 devem somar exatamente 1.0.
    """
    recognition: float = Field(default=1.10, ge=0.5, le=2.0, description="Threshold de distância euclidiana para match")
    liveness: float = Field(default=0.85, ge=0.0, le=1.0, description="Threshold de score de liveness")
    liveness_v1_weight: float = Field(default=0.40, ge=0.0, le=1.0, description="Peso do modelo MiniFASNetV1")
    liveness_v2_weight: float = Field(default=0.60, ge=0.0, le=1.0, description="Peso do modelo MiniFASNetV2")
    hsv_saturation_max: float = Field(default=140.0, ge=50.0, le=255.0, description="Saturação HSV máxima permitida (tela)")
    hsv_saturation_std_min: float = Field(default=45.0, ge=0.0, le=128.0, description="Desvio padrão mínimo de saturação")
    detection_score_min: float = Field(default=0.75, ge=0.0, le=1.0, description="Threshold mínimo de score de detecção (SCRFD)")

    @model_validator(mode='after')
    def weights_must_sum_to_one(self) -> 'ThresholdConfig':
        """Valida que pesos v1 e v2 de liveness somam 1.0."""
        total = self.liveness_v1_weight + self.liveness_v2_weight
        if not (0.99 <= total <= 1.01):
            raise ValueError(
                f'liveness_v1_weight + liveness_v2_weight deve ser 1.0, '
                f'recebido {total:.3f}'
            )
        return self


class RecognizeRequest(BaseModel):
    """Request para POST /recognize com suporte a thresholds dinâmicos."""
    tenant_id: str = Field(..., description="ID do tenant para isolamento de cache")
    candidates: list[dict] = Field(..., description="Lista de candidatos com embeddings criptografados")
    thresholds: ThresholdConfig = Field(default_factory=ThresholdConfig, description="Thresholds customizáveis")


class RecognizeResponse(BaseModel):
    """Response completo de /recognize com todos os scores brutos."""
    status: str = Field(..., description="Status: identified, not_identified, liveness_failed, no_face_detected, multiple_faces_detected")
    person_id: Optional[int] = None
    confidence: Optional[float] = None
    liveness_score: Optional[float] = None
    liveness_v1_raw: Optional[float] = None
    liveness_v2_raw: Optional[float] = None
    liveness_combined_raw: Optional[float] = None
    saturation_mean: Optional[float] = None
    saturation_std: Optional[float] = None
    detection_score_raw: Optional[float] = None
    best_distance_raw: Optional[float] = None
    processing_ms: int


# ============================================================================
# SCHEMAS DE CALIBRAÇÃO
# ============================================================================

class CalibrationSampleResult(BaseModel):
    """
    Scores brutos de uma amostra individual processada na calibração.
    """
    label: Literal['real', 'attack']
    face_detected: bool
    detection_score: Optional[float] = None
    liveness_v1_raw: Optional[float] = None
    liveness_v2_raw: Optional[float] = None
    liveness_combined: Optional[float] = None
    saturation_mean: Optional[float] = None
    saturation_std: Optional[float] = None
    error: Optional[str] = None


class ThresholdAnalysis(BaseModel):
    """
    Resultado da análise de otimização de um threshold específico.
    Usa índice de Youden para balancear sensibilidade e especificidade.
    """
    metric: str = Field(..., description="Nome da métrica: 'liveness' ou 'hsv_saturation'")
    suggested_value: float = Field(..., description="Valor de threshold sugerido")
    real_pass_rate: float = Field(..., description="% de amostras reais que passam (0.0-1.0)")
    attack_block_rate: float = Field(..., description="% de ataques bloqueados (0.0-1.0)")
    youden_score: float = Field(..., description="Índice de Youden (0.0-1.0)")
    confidence: Literal['low', 'medium', 'high'] = Field(..., description="Confiança da análise")
    interpretation: str = Field(..., description="Interpretação em português")


class CalibrateResponse(BaseModel):
    """
    Response completo do endpoint POST /calibrate com análise de thresholds.
    """
    samples: list[CalibrationSampleResult] = Field(..., description="Scores brutos de cada amostra")
    liveness_analysis: ThresholdAnalysis = Field(..., description="Análise de threshold de liveness")
    hsv_analysis: ThresholdAnalysis = Field(..., description="Análise de threshold de saturação HSV")
    suggested_thresholds: ThresholdConfig = Field(..., description="Thresholds sugeridos consolidados")
    total_samples: int
    real_samples_processed: int
    attack_samples_processed: int
    real_samples_failed: int
    attack_samples_failed: int
    overall_interpretation: str = Field(..., description="Resumo geral em português")
    warning: Optional[str] = None


# ============================================================================
# SCHEMAS DE CALIBRAÇÃO DE RECONHECIMENTO
# ============================================================================

class RecognitionSampleResult(BaseModel):
    """Resultado de processamento de uma amostra para calibração de reconhecimento."""
    label: Literal['same_person', 'other_person']
    face_detected: bool
    error: Optional[str] = None


class RecognitionCalibrateResponse(BaseModel):
    """
    Response do endpoint POST /calibrate/recognition.

    Contém análise estatística das distribuições de distância genuína (mesma pessoa)
    e impostora (pessoas diferentes), com threshold sugerido.
    """
    recognition_analysis: ThresholdAnalysis = Field(..., description="Análise do threshold de reconhecimento")
    suggested_threshold: float = Field(..., description="Threshold de distância L2 sugerido")
    genuine_distances: list[float] = Field(..., description="Distâncias L2 entre pares da mesma pessoa")
    impostor_distances: list[float] = Field(..., description="Distâncias L2 entre pares de pessoas diferentes")
    same_person_valid: int = Field(..., description="Número de fotos válidas da mesma pessoa")
    other_person_valid: int = Field(..., description="Número de fotos válidas de outras pessoas")
    genuine_pairs_analyzed: int = Field(..., description="Total de pares genuínos analisados")
    impostor_pairs_analyzed: int = Field(..., description="Total de pares impostores analisados")
    genuine_mean: float = Field(..., description="Distância média genuína")
    impostor_mean: float = Field(..., description="Distância média impostora")
    overall_interpretation: str = Field(..., description="Resumo em português")
    warning: Optional[str] = None
