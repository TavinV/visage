"""
Face Recognition Engine - MVP
FastAPI application principal com inicialização de modelos e rotas.

IMPORTANTE: Executar com workers=1 para garantir cache em memória compartilhado
entre requisições. Múltiplos workers quebram o cache local (cada worker tem sua
própria instância de memória).

Execução:
    uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
"""

import time
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from insightface.app import FaceAnalysis

from app.core.config import settings
from app.infra.cache_memory import MemoryEmbeddingCache
from app.utils.crypto import EmbeddingCrypto
from app.services.dek_manager import DEKManager
from app.engine.detector import FaceDetector
from app.engine.embedder import FaceEmbedder
from app.engine.liveness import LivenessDetector
from app.engine.comparator import FaceComparator
from app.core.security import validate_api_key_middleware
from app.api.routes import recognize, embeddings, calibrate


# Instâncias globais de modelos (singleton por worker)
face_analysis: FaceAnalysis = None
face_detector: FaceDetector = None
face_embedder: FaceEmbedder = None
liveness_detector: LivenessDetector = None
face_comparator: FaceComparator = None
embedding_cache: MemoryEmbeddingCache = None
dek_manager: DEKManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager do lifespan do FastAPI.
    Carrega modelos no startup e libera recursos no shutdown.
    """
    global face_analysis, face_detector, face_embedder, liveness_detector
    global face_comparator, embedding_cache, dek_manager

    # ========== STARTUP ==========
    print("[STARTUP] Carregando Face Recognition Engine...")

    try:
        # Inicializar DEK Manager (descriptografa DEKs com MASTER_KEY)
        print("[STARTUP] Inicializando DEK Manager...")
        dek_manager = DEKManager(settings.master_key, ttl_hours=settings.dek_cache_ttl_hours)
        print("[STARTUP] ✓ DEK Manager inicializado")

        # Carregar FaceAnalysis (SCRFD detector + ArcFace embedder)
        print("[STARTUP] Inicializando FaceAnalysis com buffalo_s...")
        face_analysis = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
        face_analysis.prepare(ctx_id=-1, det_size=(320, 320))
        print("[STARTUP] ✓ FaceAnalysis carregado")

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

        print("[STARTUP] ✓ Engine pronta para operação!")

    except Exception as e:
        print(f"[STARTUP] ✗ Erro ao carregar modelos: {str(e)}")
        raise

    yield

    # ========== SHUTDOWN ==========
    print("[SHUTDOWN] Liberando recursos...")
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

    # IMPORTANTE: Usar workers=1 para garantir cache em memória compartilhado
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        workers=1,  # NÃO AUMENTAR - quebra o cache em memória
        reload=False,
    )
