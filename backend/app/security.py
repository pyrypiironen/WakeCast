import os
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader


refresh_api_key_header = APIKeyHeader(
    name="X-API-Key",
    scheme_name="ManualRefreshAPIKey",
    auto_error=False,
)


async def require_refresh_api_key(
    api_key: str | None = Depends(refresh_api_key_header),
) -> None:
    expected_key = os.getenv("WEATHER_REFRESH_API_KEY")

    if not expected_key or not expected_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Manual weather refresh is disabled",
        )

    if not api_key or not secrets.compare_digest(
        api_key.encode("utf-8"),
        expected_key.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid or missing API key",
        )