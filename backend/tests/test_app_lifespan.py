from datetime import UTC, datetime
from unittest.mock import MagicMock, call

import pytest
from fastapi.testclient import TestClient

from app import main


def test_scheduler_starts_and_stops_with_app(monkeypatch):
    mock_scheduler = MagicMock()
    monkeypatch.setattr(main, "scheduler", mock_scheduler)

    before_start = datetime.now(UTC)

    with TestClient(main.app) as client:
        after_start = datetime.now(UTC)
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        mock_scheduler.start.assert_called_once_with(paused=True)
        mock_scheduler.resume.assert_called_once_with()
        mock_scheduler.shutdown.assert_not_called()

        modifications = mock_scheduler.modify_job.call_args_list

        assert len(modifications) == 3
        assert [entry.args[0] for entry in modifications] == [
            "refresh_weather_forecasts",
            "refresh_weather_observations",
            "refresh_water_temperatures",
        ]

        startup_time = modifications[0].kwargs["next_run_time"]

        assert before_start <= startup_time <= after_start

        for entry in modifications:
            assert entry.kwargs == {
                "next_run_time": startup_time,
                "misfire_grace_time": 60,
                "coalesce": True,
                "max_instances": 1,
            }

        assert mock_scheduler.method_calls == [
            call.start(paused=True),
            *[
                call.modify_job(
                    job_id,
                    next_run_time=startup_time,
                    misfire_grace_time=60,
                    coalesce=True,
                    max_instances=1,
                )
                for job_id in (
                    "refresh_weather_forecasts",
                    "refresh_weather_observations",
                    "refresh_water_temperatures",
                )
            ],
            call.resume(),
        ]

    mock_scheduler.shutdown.assert_called_once_with()


def test_scheduler_startup_failure(monkeypatch):
    mock_scheduler = MagicMock()
    mock_scheduler.start.side_effect = RuntimeError(
        "Simulated scheduler startup failure"
    )

    monkeypatch.setattr(main, "scheduler", mock_scheduler)

    with (
        pytest.raises(
            RuntimeError,
            match="Simulated scheduler startup failure",
        ),
        TestClient(main.app),
    ):
        pass

    mock_scheduler.start.assert_called_once_with(paused=True)
    mock_scheduler.modify_job.assert_not_called()
    mock_scheduler.resume.assert_not_called()
    mock_scheduler.shutdown.assert_not_called()


@pytest.mark.parametrize("failing_method", ["modify_job", "resume"])
def test_scheduler_stops_after_startup_configuration_failure(
    monkeypatch,
    failing_method,
):
    mock_scheduler = MagicMock()
    getattr(mock_scheduler, failing_method).side_effect = RuntimeError(
        "Simulated startup configuration failure"
    )

    monkeypatch.setattr(main, "scheduler", mock_scheduler)

    with (
        pytest.raises(
            RuntimeError,
            match="Simulated startup configuration failure",
        ),
        TestClient(main.app),
    ):
        pass

    mock_scheduler.start.assert_called_once_with(paused=True)
    mock_scheduler.shutdown.assert_called_once_with()

    if failing_method == "modify_job":
        mock_scheduler.resume.assert_not_called()
