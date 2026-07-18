"""
Middleware de autenticação via API Key.
Valida header X-API-Key em todas as rotas exceto /health e /docs.
"""

from fastapi import Request, HTTPException, status
from typing import Callable, Any


async def validate_api_key_middleware(request: Request, call_next: Callable) -> Any:
    """
    Middleware que valida API Key no header X-API-Key.

    Compara com ENGINE_API_KEY carregada de variáveis de ambiente.
    Nunca loga o valor da chave por segurança.

    Rotas excluídas de autenticação:
    - /health (health check)
    - /docs (swagger)
    - /redoc (redoc)
    - /openapi.json (schema)

    Args:
        request: Objeto Request do FastAPI
        call_next: Função para chamar próximo middleware/rota

    Returns:
        Response do próximo handler

    Raises:
        HTTPException 401: Se chave inválida ou ausente (exceto rotas públicas)
    """
    path = request.url.path

    # Preflight CORS (OPTIONS) deve passar sem autenticação
    if request.method == "OPTIONS":
        response = await call_next(request)
        return response

    # Rotas que não requerem autenticação.
    # ⚠️ A raiz "/" é comparada por IGUALDADE — usar startswith("/") tornaria
    # TODAS as rotas públicas e desabilitaria a autenticação da engine.
    public_prefixes = ["/health", "/docs", "/redoc", "/openapi.json"]
    is_public = path == "/" or any(path.startswith(prefix) for prefix in public_prefixes)

    # Se rota é pública, passe direto
    if is_public:
        response = await call_next(request)
        return response

    # Para outras rotas, validar API Key
    from app.core.config import settings

    api_key = request.headers.get("x-api-key")

    # Validar presença
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
        )

    # Validar valor
    if api_key != settings.engine_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="unauthorized",
        )

    # Passar para próximo handler
    response = await call_next(request)
    return response
