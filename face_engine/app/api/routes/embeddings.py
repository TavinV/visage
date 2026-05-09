"""
Rotas POST /embeddings/register e DELETE /embeddings/{tenant_id}/{person_id}.
Registro de novos embeddings (múltiplas imagens com média) e invalidação de cache.
"""

import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, Form, HTTPException, status, File
from pydantic import BaseModel


router = APIRouter(tags=["embeddings"], prefix="/embeddings")


# Schemas Pydantic
class RegisterEmbeddingResponse(BaseModel):
    """Resposta de registro de embedding."""

    person_id: int
    embedding_iv: str
    embedding_tag: str
    embedding_ct: str
    model_version: str = "arcface_r50_v1"
    images_processed: int


class InvalidateResponse(BaseModel):
    """Resposta de invalidação de embedding."""

    invalidated: bool


@router.post("/register", response_model=RegisterEmbeddingResponse)
async def register_embedding(
    tenant_id: str = Form(...),
    person_id: int = Form(...),
    files: list[UploadFile] = File(...),
    dek_ct: str = Form(None),  # DEK criptografada (hex)
    dek_iv: str = Form(None),  # IV da DEK (hex)
    dek_tag: str = Form(None),  # Tag GCM da DEK (hex)
    dek_key_version: str = Form(default="1"),  # Versão da chave
) -> RegisterEmbeddingResponse:
    """
    Registra novo embedding para uma pessoa usando múltiplas imagens.
    Suporta DEK per-tenant criptografada com MASTER_KEY.

    Recebe 5 imagens da mesma pessoa, extrai embedding de cada uma,
    calcula a média dos embeddings e retorna para o Node.js persistir.
    A engine não persiste nada — apenas retorna dados criptografados.

    Args:
        tenant_id: ID do tenant
        person_id: ID da pessoa
        files: Lista de até 5 arquivos de imagem em multipart/form-data
        dek_ct: DEK criptografada com MASTER_KEY (hex format)
        dek_iv: IV de 12 bytes da DEK (hex format)
        dek_tag: Tag de autenticação GCM (hex format)
        dek_key_version: Versão da MASTER_KEY usada para cifrar DEK

    Returns:
        RegisterEmbeddingResponse com IV, tag e ciphertext em hex,
        e quantidade de imagens processadas com sucesso

    Raises:
        HTTPException 400: Imagem inválida, nenhuma face detectada ou < 1 imagem
        HTTPException 422: Erro ao processar embedding
    """
    from app.core.config import settings
    from app.utils.crypto import EmbeddingCrypto
    from app.main import dek_manager
    
    # ------------------------------------------------------------------
    # Descriptografar DEK se fornecida
    # ------------------------------------------------------------------
    if dek_ct and dek_iv and dek_tag:
        try:
            dek_manager.decrypt_dek(
                tenant_id=tenant_id,
                dek_ct_hex=dek_ct,
                dek_iv_hex=dek_iv,
                dek_tag_hex=dek_tag,
                key_version=dek_key_version,
            )
        except Exception as exc:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Erro ao descriptografar DEK: {str(exc)}",
            )
    from app.engine.detector import FaceDetector
    from app.engine.embedder import FaceEmbedder
    from app.main import face_detector, face_embedder

    if not files or len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pelo menos 1 imagem é necessária",
        )

    if len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo de 5 imagens permitidas",
        )

    embeddings_list = []
    successful_images = 0

    # Processar cada imagem
    for file in files:
        try:
            # Decodificar imagem
            image_bytes = await file.read()
            image_array = cv2.imdecode(
                np.frombuffer(image_bytes, np.uint8),
                cv2.IMREAD_COLOR,
            )
            if image_array is None:
                raise ValueError("Falha ao decodificar imagem")

            # Detectar face
            face_data = face_detector.detect_and_align(image_array)
            if face_data is None:
                # Ignorar imagens sem face detectada
                continue

            # Extrair embedding
            embedding = face_embedder.extract_embedding(face_data["embedding"])
            embeddings_list.append(embedding)
            successful_images += 1

        except Exception as e:
            # Log e continua com próximas imagens
            print(f"Erro ao processar imagem {file.filename}: {str(e)}")
            continue

    if not embeddings_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma face detectada em nenhuma das imagens fornecidas",
        )

    if successful_images < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma imagem pôde ser processada com sucesso",
        )

    # Calcular média dos embeddings
    embeddings_array = np.array(embeddings_list, dtype=np.float32)
    mean_embedding = np.mean(embeddings_array, axis=0).astype(np.float32)

    # Renormalizar L2 (importante após média)
    norm = np.linalg.norm(mean_embedding)
    if norm > 0:
        mean_embedding = mean_embedding / norm

    # Criptografar
    crypto = EmbeddingCrypto(settings.aes_key)
    iv, tag, ciphertext = crypto.encrypt_embedding(mean_embedding)

    return RegisterEmbeddingResponse(
        person_id=person_id,
        embedding_iv=iv.hex(),
        embedding_tag=tag.hex(),
        embedding_ct=ciphertext.hex(),
        model_version="arcface_r50_v1",
        images_processed=successful_images,
    )


@router.delete("/{tenant_id}/{person_id}", response_model=InvalidateResponse)
async def invalidate_embedding(
    tenant_id: str,
    person_id: int,
) -> InvalidateResponse:
    """
    Invalida embedding em cache quando usuário é removido ou atualizado.

    Chamado pelo Node.js. Remove entrada do cache em memória.

    Args:
        tenant_id: ID do tenant
        person_id: ID da pessoa

    Returns:
        InvalidateResponse com invalidated=true
    """
    from app.main import embedding_cache

    embedding_cache.invalidate(tenant_id, person_id)

    return InvalidateResponse(invalidated=True)
