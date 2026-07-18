"""
Rotas de gestão de cache da engine.

POST   /cache/warm            — popula o cache de embeddings antes da chamada
DELETE /cache/dek/{tenant_id} — invalida DEK em cache (rotação de chave)

O warm cache é chamado pelo Node.js ao abrir uma sessão de chamada: todos
os candidatos da turma são decifrados uma única vez, eliminando cache miss
no pico de chegada dos alunos.
"""

from fastapi import APIRouter, HTTPException, status
from cryptography.exceptions import InvalidTag

from app.api.schemas import (
    WarmCacheRequest,
    WarmCacheResponse,
    InvalidateDekResponse,
)

router = APIRouter(tags=["cache"], prefix="/cache")


@router.post("/warm", response_model=WarmCacheResponse)
async def warm_cache(request: WarmCacheRequest) -> WarmCacheResponse:
    """
    Decifra os embeddings dos candidatos e popula o cache em memória.

    InvalidTag → HTTP 422, NUNCA silenciado: embedding adulterado ou
    cifrado com DEK de outro tenant (violação de isolamento).
    """
    from app.utils.crypto import EmbeddingCrypto
    from app.main import dek_manager, embedding_cache

    try:
        tenant_dek = dek_manager.decrypt_dek(
            tenant_id=request.tenant_id,
            dek_ct_hex=request.tenant_dek.dek_ct,
            dek_iv_hex=request.tenant_dek.dek_iv,
            dek_tag_hex=request.tenant_dek.dek_tag,
            key_version=request.tenant_dek.key_version,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao descriptografar DEK: {str(exc)}",
        )

    crypto = EmbeddingCrypto(tenant_dek.hex())
    warmed = 0

    try:
        for candidate in request.candidates:
            embedding = crypto.decrypt_embedding(
                bytes.fromhex(candidate.embedding_iv),
                bytes.fromhex(candidate.embedding_tag),
                bytes.fromhex(candidate.embedding_ct),
            )
            embedding_cache.set(request.tenant_id, candidate.person_id, embedding)
            warmed += 1
    except InvalidTag:
        # JAMAIS capturar silenciosamente
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Embedding corrompido ou adulterado (InvalidTag)",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidato inválido: {str(exc)}",
        )

    return WarmCacheResponse(warmed=warmed)


@router.delete("/dek/{tenant_id}", response_model=InvalidateDekResponse)
async def invalidate_dek(tenant_id: str) -> InvalidateDekResponse:
    """
    Invalida a DEK em cache de um tenant.

    Chamado pelo Node.js após rotação de chave — sem isso, a DEK antiga
    permaneceria em memória por até 1h (TTL) e os embeddings re-cifrados
    falhariam com InvalidTag.
    """
    from app.main import dek_manager, embedding_cache

    dek_manager.invalidate_tenant_dek(tenant_id)
    # Embeddings em cache são plaintext (não dependem da DEK), mas invalidar
    # o tenant inteiro garante consistência após operações administrativas.
    embedding_cache.invalidate_tenant(tenant_id)

    return InvalidateDekResponse(invalidated=True)
