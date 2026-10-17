from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)
from app.services import weather_refresh

NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)


@pytest.mark.parametrize(
    ("latest_age", "expected_lookback", "expected_requests"),
    [
        (None, timedelta(hours=6), 1),
        (
            timedelta(minutes=20),
            timedelta(hours=1, minutes=20),
            1,
        ),
        (
            timedelta(days=2),
            timedelta(days=2, hours=1),
            3,
        ),
        (
            timedelta(days=10),
            timedelta(days=7),
            7,
        ),
    ],
)
def test_observation_catchup_requests_expected_windows(
    monkeypatch,
    latest_age,
    expected_lookback,
    expected_requests,
):
    db = Mock()
    latest = None if latest_age is None else NOW - latest_age
    db.query.return_value.filter.return_value.scalar.return_value = latest

    station = SimpleNamespace(id=42, source_station_id=100971)

    def fetch(station_id, start_time, end_time):
        return WeatherObservationResponse(
            observation_location="Catch-up Station",
            observation_station_id=station_id,
            observations=[
                WeatherObservation(
                    timestamp=start_time - timedelta(minutes=10),
                    temperature=8.0,
                ),
                WeatherObservation(
                    timestamp=end_time,
                    temperature=12.0,
                ),
                WeatherObservation(
                    timestamp=end_time + timedelta(minutes=10),
                    temperature=14.0,
                ),
            ],
        )

    fetch_mock = Mock(side_effect=fetch)
    save_mock = Mock(return_value=1)

    monkeypatch.setattr(weather_refresh, "get_observations", fetch_mock)
    monkeypatch.setattr(weather_refresh, "save_observations", save_mock)

    saved = weather_refresh.refresh_observations(
        db=db,
        station=station,
        now=NOW,
    )

    assert saved == expected_requests
    assert fetch_mock.call_count == expected_requests
    assert save_mock.call_count == expected_requests
    db.commit.assert_called_once_with()

    calls = fetch_mock.call_args_list
    assert calls[0].kwargs["start_time"] == NOW - expected_lookback
    assert calls[-1].kwargs["end_time"] == NOW

    for index, fetch_call in enumerate(calls):
        request = fetch_call.kwargs

        assert request["station_id"] == station.source_station_id
        assert (
            timedelta(0)
            < (request["end_time"] - request["start_time"])
            <= timedelta(days=1)
        )

        if index:
            assert request["start_time"] == calls[index - 1].kwargs["end_time"]

        saved_batch = save_mock.call_args_list[index].kwargs
        assert saved_batch["commit"] is False
        assert saved_batch["weather_station_id"] == station.id
        assert [point.timestamp for point in saved_batch["weather"].observations] == [
            request["end_time"]
        ]


def test_observation_catchup_does_not_commit_after_later_fetch_failure(
    monkeypatch,
):
    db = Mock()
    db.query.return_value.filter.return_value.scalar.return_value = NOW - timedelta(
        days=2
    )
    station = SimpleNamespace(id=42, source_station_id=100971)

    first_response = WeatherObservationResponse(
        observation_location="Catch-up Station",
        observation_station_id=100971,
        observations=[
            WeatherObservation(
                timestamp=NOW - timedelta(days=2),
                temperature=12.0,
            ),
        ],
    )

    fetch_mock = Mock(
        side_effect=[
            first_response,
            RuntimeError("Second request failed"),
        ]
    )
    save_mock = Mock(return_value=1)

    monkeypatch.setattr(weather_refresh, "get_observations", fetch_mock)
    monkeypatch.setattr(weather_refresh, "save_observations", save_mock)

    with pytest.raises(RuntimeError, match="Second request failed"):
        weather_refresh.refresh_observations(
            db=db,
            station=station,
            now=NOW,
        )

    assert fetch_mock.call_count == 2
    save_mock.assert_called_once()
    assert save_mock.call_args.kwargs["commit"] is False
    db.commit.assert_not_called()
