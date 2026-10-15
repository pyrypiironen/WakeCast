from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.park_db import ParkDB
from app.models.weather_db import (
    WeatherForecastDB,
    WeatherObservationDB,
    WeatherStationDB,
)
from app.services import weather_storage

NOW = datetime(2026, 10, 15, 12, 30, tzinfo=UTC)


@pytest.fixture
def fixed_clock(monkeypatch):
    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz) if tz is not None else NOW.replace(tzinfo=None)

    monkeypatch.setattr(weather_storage, "datetime", FixedDateTime)


def test_forecast_retention_boundary_isolation_and_complete_snapshots(db, fixed_clock):
    parks = [
        ParkDB(
            name=f"Boundary Park {index}",
            slug=f"retention-boundary-{index}",
            city="Espoo",
            country="Finland",
            latitude=60.17,
            longitude=24.83,
            water_type="sea",
            website_url="https://example.com",
            timezone="Europe/Helsinki",
            is_active=True,
        )
        for index in range(2)
    ]
    db.add_all(parks)
    db.flush()
    park_ids = [park.id for park in parks]
    cutoff = NOW - timedelta(days=7)
    earliest = cutoff - timedelta(minutes=20)
    before = cutoff - timedelta(microseconds=1)
    after = cutoff + timedelta(microseconds=1)

    def snapshot(park_id, fetched_at):
        return [
            WeatherForecastDB(
                park_id=park_id,
                fetched_at=fetched_at,
                timestamp=NOW + timedelta(hours=hour),
                forecast_location="Karhusaari",
                source=source,
                temperature=10.0,
                wind_speed=4.0,
                wind_gust=6.0,
                wind_direction=180.0,
                precipitation=0.0,
                cloudiness=50.0,
            )
            for source in ("fmi_edited", "ecmwf")
            for hour in (1, 2)
        ]

    for fetched_at in (earliest, before, cutoff, after):
        db.add_all(snapshot(park_ids[0], fetched_at))
    for fetched_at in (earliest, before):
        db.add_all(snapshot(park_ids[1], fetched_at))
    db.flush()

    def saved_rows():
        return set(
            db.execute(
                select(
                    WeatherForecastDB.id,
                    WeatherForecastDB.park_id,
                    WeatherForecastDB.fetched_at,
                    WeatherForecastDB.timestamp,
                    WeatherForecastDB.source,
                ).where(WeatherForecastDB.park_id.in_(park_ids))
            ).all()
        )

    original = saved_rows()
    expected = {
        row
        for row in original
        if not (row.park_id == park_ids[0] and row.fetched_at == before)
    }
    assert len(original) == 24
    assert weather_storage.cleanup_old_forecast_snapshots(db, park_ids[0]) == 4
    assert saved_rows() == expected
    assert weather_storage.cleanup_old_forecast_snapshots(db, park_ids[0]) == 0
    assert saved_rows() == expected


def test_observation_retention_exact_cutoff(db, fixed_clock):
    station = WeatherStationDB(
        name="Boundary Station",
        region="test",
        source="fmi",
        source_station_id=999970,
        is_active=True,
    )
    db.add(station)
    db.flush()
    station_id = station.id
    cutoff = NOW - timedelta(days=183)
    before = cutoff - timedelta(microseconds=1)
    after = cutoff + timedelta(microseconds=1)
    old_hour = cutoff.replace(minute=0)
    old_native_hourly = old_hour - timedelta(minutes=30)
    old_unknown = old_hour - timedelta(minutes=20)
    original = {
        before: 10,
        cutoff: 10,
        after: 10,
        old_hour: 10,
        old_native_hourly: 60,
        old_unknown: None,
    }
    for timestamp, resolution in original.items():
        db.add(
            WeatherObservationDB(
                weather_station_id=station_id,
                timestamp=timestamp,
                fetched_at=NOW,
                observation_location="Boundary Station",
                temperature=10.0,
                source="fmi",
                resolution_minutes=resolution,
                is_aggregated=False,
            )
        )
    db.flush()

    def saved_rows():
        return dict(
            db.execute(
                select(
                    WeatherObservationDB.timestamp,
                    WeatherObservationDB.resolution_minutes,
                ).where(WeatherObservationDB.weather_station_id == station_id)
            ).all()
        )

    expected = {key: value for key, value in original.items() if key != before}
    expected[old_hour] = 60
    assert saved_rows() == original
    assert weather_storage.cleanup_old_observations(db, station_id) == 1
    assert saved_rows() == expected
    assert weather_storage.cleanup_old_observations(db, station_id) == 0
    assert saved_rows() == expected
