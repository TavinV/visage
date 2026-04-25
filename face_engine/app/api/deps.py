"""FastAPI dependency injection and injection point definitions."""

from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.config import settings


async def verify_api_key(x_api_key: Annotated[str, ...] = None) -> str:
    """Verify API key from X-API-Key header."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API Key"
        )
    if x_api_key != settings.engine_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )
    return x_api_key
