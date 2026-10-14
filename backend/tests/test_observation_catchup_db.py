from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest

from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)
from app.models.weather_db import WeatherObservationDB, WeatherStationDB
from app.services import weather_refresh

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def make_station(source_station_id):
    return WeatherStationDB(
        name=f"Catch-up Station {source_station_id}",
        region="test",
        source="fmi",
        source_station_id=source_station_id,
        is_active=True,
    )


def make_observation(station_id, timestamp, temperature=5.0):
    return WeatherObservationDB(
        weather_station_id=station_id,
        timestamp=timestamp,
        fetched_at=NOW - timedelta(days=3),
        observation_location="Catch-up Station",
        temperature=temperature,
        resolution_minutes=10,
        is_aggregated=False,
        source="fmi",
    )


def test_catchup_uses_station_history_and_upserts_on_repeat(db, monkeypatch):
    target = make_station(999950)
    other = make_station(999951)
    db.add_all([target, other])
    db.flush()

    target_id = target.id
    other_id = other.id
    latest_valid = NOW - timedelta(hours=2)
    new_timestamp = NOW - timedelta(minutes=10)

    db.add_all(
        [
            make_observation(target_id, latest_valid),
            make_observation(target_id, NOW + timedelta(days=1)),
            make_observation(other_id, NOW - timedelta(minutes=5)),
        ]
    )
    db.commit()

    response = WeatherObservationResponse(
        observation_location="Catch-up Station",
        observation_station_id=999950,
        observations=[
            WeatherObservation(
                timestamp=new_timestamp,
                temperature=12.0,
            ),
        ],
    )
    fetch = Mock(return_value=response)
    monkeypatch.setattr(weather_refresh, "get_observations", fetch)

    assert weather_refresh.refresh_observations(db, target, now=NOW) == 1

    fetch.assert_called_once_with(
        station_id=999950,
        start_time=latest_valid - timedelta(hours=1),
        end_time=NOW,
    )

    first_row = (
        db.query(WeatherObservationDB)
        .filter(
            WeatherObservationDB.weather_station_id == target_id,
            WeatherObservationDB.timestamp == new_timestamp,
        )
        .one()
    )
    first_row_id = first_row.id

    response.observations[0].temperature = 13.0
    fetch.reset_mock()

    assert weather_refresh.refresh_observations(db, target, now=NOW) == 1

    fetch.assert_called_once_with(
        station_id=999950,
        start_time=new_timestamp - timedelta(hours=1),
        end_time=NOW,
    )

    db.expire_all()
    rows = (
        db.query(WeatherObservationDB)
        .filter(WeatherObservationDB.weather_station_id == target_id)
        .all()
    )

    assert len(rows) == 3

    updated = next(row for row in rows if row.timestamp == new_timestamp)
    assert updated.id == first_row_id
    assert updated.temperature == 13.0

    other_rows = (
        db.query(WeatherObservationDB)
        .filter(WeatherObservationDB.weather_station_id == other_id)
        .all()
    )
    assert len(other_rows) == 1
    assert other_rows[0].temperature == 5.0


@pytest.mark.parametrize("failure_stage", ["fetch", "save"])
def test_catchup_rollback_restores_previous_data(
    db,
    monkeypatch,
    failure_stage,
):
    station = make_station(999952)
    db.add(station)
    db.flush()
    station_id = station.id

    existing_timestamp = NOW - timedelta(days=2)
    original_fetched_at = NOW - timedelta(days=3)

    db.add(make_observation(station_id, existing_timestamp))
    db.commit()

    fetch_count = 0

    def fetch(station_id, start_time, end_time):
        nonlocal fetch_count
        fetch_count += 1

        if failure_stage == "fetch" and fetch_count == 2:
            raise RuntimeError("Later batch failed")

        observations = [
            WeatherObservation(
                timestamp=end_time,
                temperature=15.0,
            ),
        ]

        if fetch_count == 1:
            observations.insert(
                0,
                WeatherObservation(
                    timestamp=existing_timestamp,
                    temperature=99.0,
                ),
            )

        return WeatherObservationResponse(
            observation_location="Catch-up Station",
            observation_station_id=station_id,
            observations=observations,
        )

    original_save = weather_refresh.save_observations
    save_count = 0

    def save(**kwargs):
        nonlocal save_count
        save_count += 1

        if failure_stage == "save" and save_count == 2:
            raise RuntimeError("Later batch failed")

        return original_save(**kwargs)

    monkeypatch.setattr(weather_refresh, "get_observations", fetch)
    monkeypatch.setattr(weather_refresh, "save_observations", save)

    with pytest.raises(RuntimeError, match="Later batch failed"):
        weather_refresh.refresh_observations(
            db=db,
            station=station,
            now=NOW,
        )

    # Match the scheduler's existing failure handling.
    db.rollback()

    rows = (
        db.query(WeatherObservationDB)
        .filter(WeatherObservationDB.weather_station_id == station_id)
        .all()
    )

    assert fetch_count == 2
    assert save_count == (1 if failure_stage == "fetch" else 2)
    assert len(rows) == 1
    assert rows[0].timestamp == existing_timestamp
    assert rows[0].temperature == 5.0
    assert rows[0].fetched_at == original_fetched_at
