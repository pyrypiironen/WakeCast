from app.models.park_db import ParkDB
from app.services import weather_scheduler
from app.models.weather_db import WeatherStationDB
from unittest.mock import MagicMock

import pytest


def test_refresh_all_active_parks(db, monkeypatch):
    def make_park(name, slug, active):
        return ParkDB(
            name=name,
            slug=slug,
            city="Espoo",
            country="Finland",
            latitude=60.0,
            longitude=24.0,
            water_type="sea",
            website_url="https://example.com",
            timezone="Europe/Helsinki",
            is_active=active,
        )

    active_park = make_park("Active Park", "active-test-park", True)
    inactive_park = make_park("Inactive Park", "inactive-test-park", False)

    db.add_all([active_park, inactive_park])
    db.flush()

    refresh_calls = []
    cleanup_calls = []

    def fake_refresh(db, park):
        refresh_calls.append(park.id)

    def fake_cleanup(db, park_id):
        cleanup_calls.append(park_id)

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_park_forecast",
        fake_refresh,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "cleanup_old_forecast_snapshots",
        fake_cleanup,
    )

    weather_scheduler.refresh_all_active_parks()

    assert refresh_calls == [active_park.id]
    assert cleanup_calls == [active_park.id]


def test_refresh_all_active_weather_stations(db, monkeypatch):
    active_station = WeatherStationDB(
        name="Active Test Station",
        region="test",
        source="fmi",
        source_station_id=999970,
        is_active=True,
    )

    inactive_station = WeatherStationDB(
        name="Inactive Test Station",
        region="test",
        source="fmi",
        source_station_id=999971,
        is_active=False,
    )

    db.add_all([active_station, inactive_station])
    db.flush()

    refresh_calls = []

    def fake_refresh(db, station):
        refresh_calls.append(station.id)

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_observations",
        fake_refresh,
    )

    weather_scheduler.refresh_all_active_weather_stations()

    assert refresh_calls == [active_station.id]


def test_cleanup_all_active_weather_stations(db, monkeypatch):
    active_station = WeatherStationDB(
        name="Active Cleanup Station",
        region="test",
        source="fmi",
        source_station_id=999972,
        is_active=True,
    )

    inactive_station = WeatherStationDB(
        name="Inactive Cleanup Station",
        region="test",
        source="fmi",
        source_station_id=999973,
        is_active=False,
    )

    db.add_all([active_station, inactive_station])
    db.flush()

    cleanup_calls = []

    def fake_cleanup(db, weather_station_id):
        cleanup_calls.append(weather_station_id)

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "cleanup_old_observations",
        fake_cleanup,
    )

    weather_scheduler.cleanup_all_active_weather_stations()

    assert cleanup_calls == [active_station.id]


def test_scheduler_closes_session_on_refresh_failure(monkeypatch):
    mock_db = MagicMock()

    park = MagicMock()
    park.id = 123
    park.slug = "failing-test-park"

    mock_db.query.return_value.filter.return_value.all.return_value = [park]

    def failing_refresh(db, park):
        raise RuntimeError("Simulated FMI failure")

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_park_forecast",
        failing_refresh,
    )

    weather_scheduler.refresh_all_active_parks()

    mock_db.rollback.assert_called_once()
    mock_db.close.assert_called_once()


def test_scheduler_continues_after_park_failure(monkeypatch):
    mock_db = MagicMock()

    failing_park = MagicMock()
    failing_park.id = 101
    failing_park.slug = "failing-park"

    successful_park = MagicMock()
    successful_park.id = 102
    successful_park.slug = "successful-park"

    mock_db.query.return_value.filter.return_value.all.return_value = [
        failing_park,
        successful_park,
    ]

    refresh_calls = []
    cleanup_calls = []

    def fake_refresh(db, park):
        refresh_calls.append(park.id)

        if park.id == failing_park.id:
            raise RuntimeError("Simulated refresh failure")

    def fake_cleanup(db, park_id):
        cleanup_calls.append(park_id)

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_park_forecast",
        fake_refresh,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "cleanup_old_forecast_snapshots",
        fake_cleanup,
    )

    weather_scheduler.refresh_all_active_parks()

    assert refresh_calls == [101, 102]
    assert cleanup_calls == [102]

    mock_db.rollback.assert_called_once()
    mock_db.close.assert_called_once()


def test_scheduler_continues_after_station_refresh_failure(monkeypatch):
    mock_db = MagicMock()

    failing_station = MagicMock()
    failing_station.id = 201

    successful_station = MagicMock()
    successful_station.id = 202

    mock_db.query.return_value.filter.return_value.all.return_value = [
        failing_station,
        successful_station,
    ]

    refresh_calls = []

    def fake_refresh(db, station):
        refresh_calls.append(station.id)

        if station.id == 201:
            raise RuntimeError("Simulated FMI failure")

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_observations",
        fake_refresh,
    )

    weather_scheduler.refresh_all_active_weather_stations()

    assert refresh_calls == [201, 202]

    mock_db.rollback.assert_called_once()
    mock_db.close.assert_called_once()


def test_scheduler_continues_after_station_cleanup_failure(monkeypatch):
    mock_db = MagicMock()

    failing_station = MagicMock()
    failing_station.id = 301

    successful_station = MagicMock()
    successful_station.id = 302

    mock_db.query.return_value.filter.return_value.all.return_value = [
        failing_station,
        successful_station,
    ]

    cleanup_calls = []

    def fake_cleanup(db, weather_station_id):
        cleanup_calls.append(weather_station_id)

        if weather_station_id == 301:
            raise RuntimeError("Simulated cleanup failure")

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        "cleanup_old_observations",
        fake_cleanup,
    )

    weather_scheduler.cleanup_all_active_weather_stations()

    assert cleanup_calls == [301, 302]

    mock_db.rollback.assert_called_once()
    mock_db.close.assert_called_once()


def test_scheduler_closes_session_on_database_query_failure(monkeypatch):
    mock_db = MagicMock()

    mock_db.query.side_effect = RuntimeError("Simulated database query failure")

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )

    with pytest.raises(
        RuntimeError,
        match="Simulated database query failure",
    ):
        weather_scheduler.refresh_all_active_parks()

    mock_db.close.assert_called_once()
