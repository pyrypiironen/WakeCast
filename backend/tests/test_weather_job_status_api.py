from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app import main
from app.services.weather_job_monitor import WeatherJobMonitor

STATUS_URL = "/api/admin/weather-jobs"
TEST_KEY = "test-job-status-key"


@pytest.fixture
def status_client(monkeypatch):
    monkeypatch.setenv("WEATHER_REFRESH_API_KEY", TEST_KEY)

    monitor = WeatherJobMonitor()
    monitor.register("refresh_weather_forecasts")

    snapshot = Mock(wraps=monitor.snapshot)
    monkeypatch.setattr(monitor, "snapshot", snapshot)
    monkeypatch.setattr(main, "job_monitor", monitor)
    monkeypatch.setattr(
        main,
        "scheduler",
        SimpleNamespace(running=True),
    )

    # No context manager: avoid starting the background scheduler.
    client = TestClient(main.app)

    try:
        yield client, monitor, snapshot
    finally:
        client.close()


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-API-Key": ""},
        {"X-API-Key": "wrong-key"},
    ],
)
def test_status_rejects_missing_or_invalid_key(status_client, headers):
    client, _, snapshot = status_client

    response = client.get(STATUS_URL, headers=headers)

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Invalid or missing API key",
    }
    snapshot.assert_not_called()


@pytest.mark.parametrize("configured_key", [None, "", "   "])
def test_status_disabled_without_configured_key(
    status_client,
    monkeypatch,
    configured_key,
):
    client, _, snapshot = status_client

    if configured_key is None:
        monkeypatch.delenv("WEATHER_REFRESH_API_KEY")
    else:
        monkeypatch.setenv("WEATHER_REFRESH_API_KEY", configured_key)

    response = client.get(
        STATUS_URL,
        headers={"X-API-Key": TEST_KEY},
    )

    assert response.status_code == 503
    snapshot.assert_not_called()


def test_status_rejects_key_in_query_string(status_client):
    client, _, snapshot = status_client

    response = client.get(
        STATUS_URL,
        params={"X-API-Key": TEST_KEY},
    )

    assert response.status_code == 403
    snapshot.assert_not_called()


def test_status_returns_run_outcome_and_timestamps(status_client):
    client, monitor, snapshot = status_client
    headers = {"X-API-Key": TEST_KEY}

    initial_response = client.get(STATUS_URL, headers=headers)

    assert initial_response.status_code == 200
    initial = initial_response.json()

    assert initial["scope"] == "process"
    assert initial["scheduler_running"] is True
    assert initial["jobs"]["refresh_weather_forecasts"] == {
        "status": "never_run",
        "started_at": None,
        "finished_at": None,
        "last_successful_run_at": None,
        "result": None,
        "error_type": None,
    }

    result = {"succeeded": 1, "failed": 1, "skipped": 0}
    monitor.run(
        "refresh_weather_forecasts",
        Mock(return_value=result),
    )

    response = client.get(STATUS_URL, headers=headers)

    assert response.status_code == 200
    state = response.json()["jobs"]["refresh_weather_forecasts"]

    assert state["status"] == "partial"
    assert state["result"] == result
    assert state["last_successful_run_at"] is None
    assert state["error_type"] is None

    started_at = datetime.fromisoformat(state["started_at"])
    finished_at = datetime.fromisoformat(state["finished_at"])

    assert started_at.utcoffset() is not None
    assert finished_at.utcoffset() is not None
    assert started_at <= finished_at
    assert snapshot.call_count == 2


def test_status_openapi_requires_api_key(status_client):
    client, _, snapshot = status_client

    schema = client.get("/openapi.json").json()
    operation = schema["paths"][STATUS_URL]["get"]

    assert operation["security"] == [
        {"ManualRefreshAPIKey": []},
    ]
    snapshot.assert_not_called()
