"""
Schemas Pydantic para a API Face Recognition Engine.
Inclui schemas para reconhecimento dinâmico com thresholds customizáveis
e calibração automática de thresholds.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal, Union


# ============================================================================
# SCHEMAS DE CRIPTOGRAFIA
# ============================================================================

class EncryptedDEK(BaseModel):
    """DEK encriptada com MASTER_KEY — recebida do Node.js"""
    dek_ct: str = Field(..., description="Ciphertext em hexadecimal")
    dek_iv: str = Field(..., description="IV em hexadecimal (12 bytes)")
    dek_tag: str = Field(..., description="Tag GCM em hexadecimal (16 bytes)")
    key_version: int = Field(..., description="Versão da chave para auditoria")


class EncryptedEmbedding(BaseModel):
    """Embedding criptografado armazenado no Node.js.

    person_id aceita int (legado/testes) ou str (UUIDs do backend).
    """
    person_id: Union[int, str]
    embedding_iv: str = Field(..., description="IV em hexadecimal (12 bytes)")
    embedding_tag: str = Field(..., description="Tag GCM em hexadecimal (16 bytes)")
    embedding_ct: str = Field(..., description="Ciphertext em hexadecimal (2048 bytes)")
    key_version: int = Field(..., description="Versão da DEK usada na criptografia")


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
    """Request para POST /recognize com suporte a thresholds dinâmicos e DEK por tenant."""
    tenant_id: str = Field(..., description="ID do tenant para isolamento de cache")
    tenant_dek: EncryptedDEK = Field(..., description="DEK encriptada com MASTER_KEY")
    candidates: list[EncryptedEmbedding] = Field(..., description="Lista de candidatos com embeddings criptografados")
    thresholds: ThresholdConfig = Field(default_factory=ThresholdConfig, description="Thresholds customizáveis")


class RecognizeResponse(BaseModel):
    """Response completo de /recognize com todos os scores brutos."""
    status: str = Field(..., description="Status: identified, not_identified, liveness_failed, no_face_detected, multiple_faces_detected")
    person_id: Optional[Union[int, str]] = None
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
# SCHEMAS DE ENROLLMENT (cadastro via QR Code)
# ============================================================================

class EnrollFrameResponse(BaseModel):
    """Response de POST /enroll/frame.

    status = 'frame_accepted' → embedding do frame cifrado individualmente
    com a DEK do tenant (mesmo formato de /embeddings/register).
    Qualquer outro status → frame rejeitado, frontend re-tenta.
    """
    status: str = Field(
        ...,
        description=(
            "frame_accepted | no_face_detected | multiple_faces_detected | "
            "low_detection_score | liveness_failed"
        ),
    )
    embedding_iv: Optional[str] = None
    embedding_tag: Optional[str] = None
    embedding_ct: Optional[str] = None
    liveness_score: Optional[float] = None
    detection_score: Optional[float] = None
    processing_ms: int


class EnrollFrameEmbedding(BaseModel):
    """Embedding cifrado de um frame individual do fluxo de cadastro."""
    embedding_iv: str
    embedding_tag: str
    embedding_ct: str


class EnrollFinalizeRequest(BaseModel):
    """Request de POST /enroll/finalize — consolida N frames em um embedding."""
    tenant_id: str
    tenant_dek: EncryptedDEK
    frames: list[EnrollFrameEmbedding] = Field(..., min_length=1)


class EnrollFinalizeResponse(BaseModel):
    """Embedding consolidado (média vetorial + L2), cifrado com a DEK."""
    embedding_iv: str
    embedding_tag: str
    embedding_ct: str
    key_version: int
    model_version: str = "arcface_r50_v1"
    frames_used: int


# ============================================================================
# SCHEMAS DE CACHE
# ============================================================================

class WarmCacheRequest(BaseModel):
    """Request de POST /cache/warm — popula cache antes da chamada abrir."""
    tenant_id: str
    tenant_dek: EncryptedDEK
    candidates: list[EncryptedEmbedding]


class WarmCacheResponse(BaseModel):
    """Quantidade de embeddings descriptografados e cacheados."""
    warmed: int


class InvalidateDekResponse(BaseModel):
    """Response de DELETE /cache/dek/{tenant_id}."""
    invalidated: bool


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
    suggested_enrollment_value: Optional[float] = Field(
        default=None,
        description="Apenas para 'liveness': média dos scores reais + 0.15, usado no cadastro "
                     "(mais rigoroso que o threshold de reconhecimento)",
    )


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

class PersonSummary(BaseModel):
    """Resumo de uma pessoa processada na calibração (sem embeddings brutos)."""
    person_id: str
    photo_count: int
    failed_photos: int


class DistanceDistribution(BaseModel):
    """Estatísticas descritivas de uma distribuição de distâncias."""
    count: int
    mean: float
    std: float
    min: float
    max: float
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float


class RecognitionThresholdOption(BaseModel):
    """Uma opção de threshold com seu perfil de risco."""
    profile: Literal['conservative', 'balanced', 'liberal']
    profile_label: str
    threshold: float
    genuine_accept_rate: float
    impostor_reject_rate: float
    false_rejection_rate: float
    false_acceptance_rate: float
    youden_score: float
    interpretation: str


class ThresholdCurvePoint(BaseModel):
    """Ponto na curva de métricas × limiar — para gráfico de desempenho."""
    threshold: float
    genuine_accept_rate: float
    impostor_reject_rate: float
    false_rejection_rate: float
    false_acceptance_rate: float
    youden_score: float


class HistogramBin(BaseModel):
    """Bin de histograma para sobreposição das distribuições de distância."""
    range_start: float
    range_end: float
    genuine_count: int
    impostor_count: int


class RocPoint(BaseModel):
    """Ponto na curva ROC: FAR (eixo X) × TAR/GAR (eixo Y)."""
    false_acceptance_rate: float
    genuine_accept_rate: float
    threshold: float


class CalibrationChartData(BaseModel):
    """Dados prontos para renderização de gráficos de calibração."""
    threshold_curve: list[ThresholdCurvePoint]
    histogram: list[HistogramBin]
    roc_curve: list[RocPoint]
    eer_threshold: float
    eer_value: float


class RecognitionCalibrateResponse(BaseModel):
    """Response completo da calibração de reconhecimento facial."""
    persons_processed: list[PersonSummary]
    impostor_count: int
    impostor_failed: int
    genuine_distribution: DistanceDistribution
    impostor_distribution: DistanceDistribution
    dprime: float
    eer: float
    auc: float
    options: list[RecognitionThresholdOption]
    recommended_profile: Literal['conservative', 'balanced', 'liberal']
    recommended_threshold: float
    total_genuine_pairs: int
    total_impostor_pairs: int
    confidence: Literal['low', 'medium', 'high']
    warning: Optional[str]
    overall_interpretation: str
    chart_data: CalibrationChartData
