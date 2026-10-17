from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest

from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)
from app.models.weather_db import WeatherObservationDB, WeatherStationDB
from app.services import weather_history


@pytest.mark.parametrize("fail_second_batch", [False, True])
def test_backfill_chunk_commits_atomically(
    db,
    monkeypatch,
    fail_second_batch,
):
    station = WeatherStationDB(
        name="Backfill Transaction Station",
        region="test",
        source="fmi",
        source_station_id=999960,
        is_active=True,
    )
    db.add(station)
    db.flush()
    station_id = station.id
    db.commit()

    old_time = (datetime.now(UTC) - timedelta(days=184)).replace(
        minute=0, second=0, microsecond=0
    )
    recent_time = old_time + timedelta(days=2)

    weather = WeatherObservationResponse(
        observation_location="Backfill Transaction Station",
        observation_station_id=999960,
        observations=[
            WeatherObservation(
                timestamp=timestamp,
                temperature=12.0,
            )
            for timestamp in (
                old_time,
                old_time + timedelta(minutes=10),
                recent_time,
                recent_time + timedelta(minutes=10),
            )
        ],
    )

    monkeypatch.setattr(
        weather_history,
        "get_observations",
        Mock(return_value=weather),
    )

    original_save = weather_history.save_observations
    save_calls = []

    def save_batch(**kwargs):
        save_calls.append(kwargs)

        if fail_second_batch and len(save_calls) == 2:
            raise RuntimeError("Second batch failed")

        return original_save(**kwargs)

    monkeypatch.setattr(
        weather_history,
        "save_observations",
        save_batch,
    )

    commit = Mock(wraps=db.commit)
    monkeypatch.setattr(db, "commit", commit)

    if fail_second_batch:
        with pytest.raises(RuntimeError, match="Second batch failed"):
            weather_history.backfill_observations(
                db=db,
                station=station,
                start_time=old_time,
                end_time=recent_time + timedelta(hours=1),
            )

        commit.assert_not_called()

        # Match the backfill script's failure handling.
        db.rollback()
    else:
        saved = weather_history.backfill_observations(
            db=db,
            station=station,
            start_time=old_time,
            end_time=recent_time + timedelta(hours=1),
        )

        assert saved == 3
        commit.assert_called_once_with()

    assert len(save_calls) == 2
    assert all(batch["commit"] is False for batch in save_calls)

    rows = (
        db.query(WeatherObservationDB)
        .filter(WeatherObservationDB.weather_station_id == station_id)
        .order_by(WeatherObservationDB.timestamp)
        .all()
    )

    if fail_second_batch:
        assert rows == []
    else:
        assert [row.timestamp for row in rows] == [
            old_time,
            recent_time,
            recent_time + timedelta(minutes=10),
        ]
        assert [row.resolution_minutes for row in rows] == [60, 10, 10]
