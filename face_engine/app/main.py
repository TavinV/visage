"""
Face Recognition Engine - MVP
FastAPI application principal com inicialização de modelos e rotas.

IMPORTANTE: Executar com workers=1. O cache de embeddings vive na memória do
processo e NÃO tem TTL — com vários workers, um DELETE /embeddings/... invalida
o cache de apenas um deles e os demais serviriam um embedding antigo para
sempre (ex.: aluno que refez o cadastro biométrico). A concorrência vem do
thread pool interno (ver engine_thread_pool_size), que usa a cota de CPU
inteira sem duplicar modelos nem quebrar a invalidação de cache.

Execução:
    uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 1
"""

import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from insightface.app import FaceAnalysis

from app.core.config import settings
from app.core.logging import setup_logging
from app.infra.cache_memory import MemoryEmbeddingCache
from app.utils.crypto import EmbeddingCrypto
from app.services.dek_manager import DEKManager
from app.engine.detector import FaceDetector
from app.engine.embedder import FaceEmbedder
from app.engine.liveness import LivenessDetector
from app.engine.comparator import FaceComparator
from app.core.security import validate_api_key_middleware
from app.api.routes import recognize, embeddings, calibrate, enroll, cache, detect


# Instâncias globais de modelos (singleton por worker)
face_analysis: FaceAnalysis = None
face_detector: FaceDetector = None
face_embedder: FaceEmbedder = None
liveness_detector: LivenessDetector = None
face_comparator: FaceComparator = None
embedding_cache: MemoryEmbeddingCache = None
dek_manager: DEKManager = None

# Pool que executa a inferência (CPU-bound) fora do event loop. As sessões do
# ONNX Runtime são thread-safe para Run() concorrente, então N threads deste
# pool processam N requisições em paralelo sobre os MESMOS modelos.
inference_pool: ThreadPoolExecutor = None


def _build_session_options() -> ort.SessionOptions:
    """SessionOptions alinhado à cota de CPU do container (ver config)."""
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = settings.onnx_intra_op_threads
    opts.inter_op_num_threads = settings.onnx_inter_op_threads
    return opts


def _apply_session_options(analysis: FaceAnalysis) -> None:
    """
    Recria as sessões ONNX do InsightFace com threading explícito.

    O InsightFace não expõe SessionOptions na sua API pública, e o default do
    ONNX Runtime dimensiona o pool por os.cpu_count() — que dentro do container
    devolve os núcleos do HOST (12), não a cota do cgroup (2). O resultado é
    ~6x de oversubscription e latência de detecção instável (medido: 900ms a
    3600ms). Trocar a sessão preserva os nomes de entrada/saída já capturados
    pelos modelos, pois o arquivo .onnx é exatamente o mesmo.
    """
    opts = _build_session_options()
    for taskname, model in analysis.models.items():
        model.session = ort.InferenceSession(
            model.model_file,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        print(f"[STARTUP]   ↳ sessão '{taskname}' com intra_op="
              f"{settings.onnx_intra_op_threads} inter_op={settings.onnx_inter_op_threads}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager do lifespan do FastAPI.
    Carrega modelos no startup e libera recursos no shutdown.
    """
    global face_analysis, face_detector, face_embedder, liveness_detector
    global face_comparator, embedding_cache, dek_manager, inference_pool

    # ========== STARTUP ==========
    # Logger "face_engine" com handler próprio — os logs por camada do
    # pipeline (detecção, liveness, HSV, comparação) dependem disto
    setup_logging()
    print("[STARTUP] Carregando Face Recognition Engine...")

    # O OpenCV também abre seu próprio pool; sem limite ele disputa a mesma
    # cota de CPU do ONNX (medido: cvtColor de 0.3ms saltando para 100ms)
    cv2.setNumThreads(settings.cv2_num_threads)
    print(f"[STARTUP] OpenCV limitado a {settings.cv2_num_threads} thread(s)")

    try:
        # Inicializar DEK Manager (descriptografa DEKs com MASTER_KEY)
        print("[STARTUP] Inicializando DEK Manager...")
        dek_manager = DEKManager(settings.master_key, ttl_hours=settings.dek_cache_ttl_hours)
        print("[STARTUP] ✓ DEK Manager inicializado")

        # Carregar FaceAnalysis (SCRFD detector + ArcFace embedder).
        # allowed_modules restringe aos 2 modelos que o pipeline usa: sem isso
        # o buffalo_s carrega e EXECUTA mais 3 (genderage, landmark_2d_106,
        # landmark_3d_68) por rosto, cujo resultado é descartado.
        print("[STARTUP] Inicializando FaceAnalysis com buffalo_s...")
        face_analysis = FaceAnalysis(
            name="buffalo_s",
            providers=["CPUExecutionProvider"],
            allowed_modules=["detection", "recognition"],
        )
        face_analysis.prepare(ctx_id=-1, det_size=(320, 320))
        _apply_session_options(face_analysis)
        print("[STARTUP] ✓ FaceAnalysis carregado (detection + recognition)")

        # Inicializar componentes
        print("[STARTUP] Inicializando detector...")
        face_detector = FaceDetector(face_analysis)
        print("[STARTUP] ✓ Detector inicializado")

        print("[STARTUP] Inicializando embedder...")
        face_embedder = FaceEmbedder(face_analysis)
        print("[STARTUP] ✓ Embedder inicializado")

        print("[STARTUP] Inicializando detector de liveness (V1+V2)...")
        try:
            liveness_detector = LivenessDetector(
                settings.liveness_model_v1_path,
                settings.liveness_model_v2_path,
                intra_op_threads=settings.onnx_intra_op_threads,
                inter_op_threads=settings.onnx_inter_op_threads,
            )
            print("[STARTUP] ✓ Detector de liveness V1+V2 inicializado")
        except Exception as e:
            print(f"[STARTUP] ⚠️  Liveness desativado ({type(e).__name__}: {str(e)[:100]})")
            liveness_detector = None

        print("[STARTUP] Inicializando comparador...")
        face_comparator = FaceComparator(threshold=settings.recognition_threshold)
        print("[STARTUP] ✓ Comparador inicializado")

        print("[STARTUP] Inicializando cache em memória...")
        embedding_cache = MemoryEmbeddingCache()
        print("[STARTUP] ✓ Cache inicializado")

        print("[STARTUP] Inicializando pool de inferência...")
        inference_pool = ThreadPoolExecutor(
            max_workers=settings.engine_thread_pool_size,
            thread_name_prefix="infer",
        )
        print(f"[STARTUP] ✓ Pool com {settings.engine_thread_pool_size} thread(s)")

        print("[STARTUP] ✓ Engine pronta para operação!")

    except Exception as e:
        print(f"[STARTUP] ✗ Erro ao carregar modelos: {str(e)}")
        raise

    yield

    # ========== SHUTDOWN ==========
    print("[SHUTDOWN] Liberando recursos...")
    if inference_pool is not None:
        inference_pool.shutdown(wait=True)
        inference_pool = None
    face_analysis = None
    face_detector = None
    face_embedder = None
    liveness_detector = None
    face_comparator = None
    embedding_cache = None
    dek_manager = None
    print("[SHUTDOWN] ✓ Recursos liberados")


# Criar aplicação FastAPI
app = FastAPI(
    title="Face Recognition Engine",
    description="Motor de reconhecimento facial com anti-spoofing",
    version="1.0.0",
    lifespan=lifespan,
)

# Configuração de CORS para testes (permite qualquer origem)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Adicionar middleware de autenticação
app.middleware("http")(validate_api_key_middleware)

# Incluir rotas
app.include_router(recognize.router)
app.include_router(embeddings.router)
app.include_router(calibrate.router)
app.include_router(enroll.router)
app.include_router(cache.router)
app.include_router(detect.router)


# Schema de resposta de health
class HealthResponse(BaseModel):
    """Resposta do endpoint de saúde."""

    status: str
    models: dict[str, bool]


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Verifica status dos modelos carregados.

    Returns:
        HealthResponse com status e estado de cada modelo
    """
    models_loaded = {
        "detector": face_detector is not None,
        "embedder": face_embedder is not None,
        "liveness_v1": liveness_detector is not None,
        "liveness_v2": liveness_detector is not None,
        "calibration": True,
        "calibration_recognition": True,
    }

    status_str = "ok" if all(models_loaded.values()) else "degraded"

    return HealthResponse(
        status=status_str,
        models=models_loaded,
    )


@app.get("/")
async def root() -> dict:
    """Endpoint raiz com informações da API."""
    return {
        "service": "Face Recognition Engine",
        "version": "1.0.0",
        "status": "running",
    }


if __name__ == "__main__":
    import uvicorn

    # workers=1 é obrigatório: o cache de embeddings não tem TTL e a
    # invalidação (DELETE /embeddings/...) só alcançaria um dos processos.
    # A concorrência vem do inference_pool, que satura a cota de CPU sem
    # duplicar modelos na memória. Ver docstring do módulo.
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        workers=1,  # NÃO AUMENTAR - ver docstring do módulo
        reload=False,
    )
