from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app import main
from app.database import get_db

REFRESH_URL = "/api/parks/security-test-park/weather/refresh"


@pytest.fixture
def security_client(monkeypatch):
    monkeypatch.setenv(
        "WEATHER_REFRESH_API_KEY",
        "test-refresh-secret",
    )

    database = Mock()
    database.query.return_value.filter.return_value.first.return_value = Mock(
        id=1,
    )
    database.query.return_value.all.return_value = []

    database_access = Mock()
    refresh = Mock(return_value=12)

    def override_get_db():
        database_access()
        yield database

    main.app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main, "refresh_park_forecast", refresh)

    # No context manager: avoid starting the background scheduler.
    client = TestClient(main.app)

    try:
        yield client, database_access, refresh
    finally:
        client.close()
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-API-Key": ""},
        {"X-API-Key": "wrong-key"},
    ],
)
def test_refresh_rejects_missing_or_invalid_key(
    security_client,
    headers,
):
    client, database_access, refresh = security_client

    response = client.post(REFRESH_URL, headers=headers)

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Invalid or missing API key",
    }
    database_access.assert_not_called()
    refresh.assert_not_called()


@pytest.mark.parametrize("configured_key", [None, "", "   "])
def test_refresh_disabled_without_configured_key(
    security_client,
    monkeypatch,
    configured_key,
):
    client, database_access, refresh = security_client

    if configured_key is None:
        monkeypatch.delenv("WEATHER_REFRESH_API_KEY")
    else:
        monkeypatch.setenv(
            "WEATHER_REFRESH_API_KEY",
            configured_key,
        )

    response = client.post(
        REFRESH_URL,
        headers={"X-API-Key": "test-refresh-secret"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Manual weather refresh is disabled",
    }
    database_access.assert_not_called()
    refresh.assert_not_called()


def test_refresh_accepts_valid_key(security_client):
    client, database_access, refresh = security_client

    response = client.post(
        REFRESH_URL,
        headers={"X-API-Key": "test-refresh-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "saved_rows": 12,
    }
    database_access.assert_called_once()
    refresh.assert_called_once()


def test_refresh_does_not_accept_key_in_query_string(
    security_client,
):
    client, database_access, refresh = security_client

    response = client.post(
        REFRESH_URL,
        params={"X-API-Key": "test-refresh-secret"},
    )

    assert response.status_code == 403
    database_access.assert_not_called()
    refresh.assert_not_called()


def test_public_endpoints_do_not_require_key(
    security_client,
    monkeypatch,
):
    client, _, refresh = security_client
    monkeypatch.delenv("WEATHER_REFRESH_API_KEY")

    assert client.get("/health").status_code == 200

    response = client.get("/api/parks")

    assert response.status_code == 200
    assert response.json() == []
    refresh.assert_not_called()


def test_openapi_requires_key_only_for_manual_refresh(
    security_client,
):
    client, _, _ = security_client
    schema = client.get("/openapi.json").json()

    refresh_operation = schema["paths"]["/api/parks/{slug}/weather/refresh"]["post"]

    assert refresh_operation["security"] == [
        {"ManualRefreshAPIKey": []},
    ]

    assert schema["components"]["securitySchemes"]["ManualRefreshAPIKey"] == {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
    }

    public_paths = [
        "/health",
        "/api/parks",
        "/api/parks/{slug}",
        "/api/parks/{slug}/weather",
    ]

    for path in public_paths:
        assert "security" not in schema["paths"][path]["get"]
