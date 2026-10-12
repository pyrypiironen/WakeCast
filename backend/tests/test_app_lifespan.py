from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import main


def test_scheduler_starts_and_stops_with_app(monkeypatch):
    mock_scheduler = MagicMock()

    monkeypatch.setattr(
        main,
        "scheduler",
        mock_scheduler,
    )

    with TestClient(main.app) as client:
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        mock_scheduler.start.assert_called_once()
        mock_scheduler.shutdown.assert_not_called()

    mock_scheduler.shutdown.assert_called_once()


def test_scheduler_startup_failure(monkeypatch):
    mock_scheduler = MagicMock()

    mock_scheduler.start.side_effect = RuntimeError(
        "Simulated scheduler startup failure"
    )

    monkeypatch.setattr(
        main,
        "scheduler",
        mock_scheduler,
    )

    with pytest.raises(
        RuntimeError,
        match="Simulated scheduler startup failure",
    ):
        with TestClient(main.app):
            pass

    mock_scheduler.start.assert_called_once()
    mock_scheduler.shutdown.assert_not_called()
