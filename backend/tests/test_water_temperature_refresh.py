from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.services import water_temperature_refresh as refresh_service
from app.services import weather_scheduler


@pytest.fixture
def station():
    return SimpleNamespace(
        id=1,
        source="uiras",
        source_station_id="test-water-sensor",
        is_active=True,
    )


def test_refresh_fetches_and_saves(monkeypatch, station):
    db = Mock()
    weather = Mock()
    fetch = Mock(return_value=weather)
    save = Mock(return_value=1)

    monkeypatch.setattr(refresh_service, "get_water_temperature", fetch)
    monkeypatch.setattr(
        refresh_service,
        "save_water_temperature_observations",
        save,
    )

    result = refresh_service.refresh_water_temperature(db, station)

    assert result == 1
    fetch.assert_called_once_with(station_id="test-water-sensor")
    save.assert_called_once_with(db=db, station=station, weather=weather)


def test_inactive_station_is_skipped(monkeypatch, station):
    station.is_active = False
    fetch = Mock()
    save = Mock()

    monkeypatch.setattr(refresh_service, "get_water_temperature", fetch)
    monkeypatch.setattr(
        refresh_service,
        "save_water_temperature_observations",
        save,
    )

    assert refresh_service.refresh_water_temperature(Mock(), station) == 0
    fetch.assert_not_called()
    save.assert_not_called()


def test_unsupported_source(monkeypatch, station):
    station.source = "unsupported"
    fetch = Mock()
    monkeypatch.setattr(refresh_service, "get_water_temperature", fetch)

    with pytest.raises(ValueError, match="Unsupported"):
        refresh_service.refresh_water_temperature(Mock(), station)

    fetch.assert_not_called()


def test_provider_failure_does_not_save(monkeypatch, station):
    from app.services.weather_errors import WeatherProviderError

    fetch = Mock(side_effect=WeatherProviderError("Provider unavailable"))
    save = Mock()

    monkeypatch.setattr(refresh_service, "get_water_temperature", fetch)
    monkeypatch.setattr(
        refresh_service,
        "save_water_temperature_observations",
        save,
    )

    with pytest.raises(WeatherProviderError):
        refresh_service.refresh_water_temperature(Mock(), station)

    save.assert_not_called()


def test_storage_failure_remains_internal(monkeypatch, station):
    monkeypatch.setattr(
        refresh_service,
        "get_water_temperature",
        Mock(return_value=Mock()),
    )
    monkeypatch.setattr(
        refresh_service,
        "save_water_temperature_observations",
        Mock(side_effect=RuntimeError("Storage failure")),
    )

    with pytest.raises(RuntimeError, match="Storage failure"):
        refresh_service.refresh_water_temperature(Mock(), station)


def test_scheduler_refreshes_only_active_stations(db, monkeypatch):
    from app.models.water_temperature_db import WaterTemperatureStationDB

    active = WaterTemperatureStationDB(
        name="Active Scheduler Station",
        latitude=60.0,
        longitude=24.0,
        source="uiras",
        source_station_id="active-scheduler-water-sensor",
        is_active=True,
    )
    inactive = WaterTemperatureStationDB(
        name="Inactive Scheduler Station",
        latitude=60.0,
        longitude=24.0,
        source="uiras",
        source_station_id="inactive-scheduler-water-sensor",
        is_active=False,
    )
    db.add_all([active, inactive])
    db.flush()

    # Wrap the fixture session so scheduler.close() doesn't close it.
    scheduler_db = Mock(wraps=db)
    scheduler_db.close = Mock()
    refresh = Mock()

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        Mock(return_value=scheduler_db),
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_water_temperature",
        refresh,
    )

    weather_scheduler.refresh_all_active_water_temperature_stations()

    refresh.assert_called_once_with(db=scheduler_db, station=active)
    scheduler_db.close.assert_called_once()


def test_scheduler_continues_after_station_failure(monkeypatch):
    first = SimpleNamespace(id=1)
    second = SimpleNamespace(id=2)
    db = Mock()
    db.query.return_value.filter.return_value.all.return_value = [
        first,
        second,
    ]
    refresh = Mock(side_effect=[RuntimeError("First station failed"), 1])

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        Mock(return_value=db),
    )
    monkeypatch.setattr(
        weather_scheduler,
        "refresh_water_temperature",
        refresh,
    )

    weather_scheduler.refresh_all_active_water_temperature_stations()

    assert refresh.call_count == 2
    refresh.assert_any_call(db=db, station=first)
    refresh.assert_any_call(db=db, station=second)
    db.rollback.assert_called_once()
    db.close.assert_called_once()


def test_scheduler_closes_session_after_query_failure(monkeypatch):
    db = Mock()
    db.query.side_effect = RuntimeError("Database query failed")

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        Mock(return_value=db),
    )

    with pytest.raises(RuntimeError, match="Database query failed"):
        weather_scheduler.refresh_all_active_water_temperature_stations()

    db.close.assert_called_once()
