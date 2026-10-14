from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.models.park_db import ParkDB
from app.models.weather_db import WeatherStationDB
from app.services import weather_scheduler
from app.services.weather_refresh_lock import ForecastRefreshInProgress


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


def test_scheduler_skips_busy_park_and_continues(monkeypatch):
    mock_db = MagicMock()

    busy_park = MagicMock()
    busy_park.id = 101

    available_park = MagicMock()
    available_park.id = 102

    mock_db.query.return_value.filter.return_value.all.return_value = [
        busy_park,
        available_park,
    ]

    refresh_calls = []
    cleanup = MagicMock()
    logger = MagicMock()

    def fake_refresh(db, park):
        refresh_calls.append(park.id)

        if park.id == 101:
            raise ForecastRefreshInProgress(
                "Weather forecast refresh already in progress"
            )

        return 2

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
        cleanup,
    )
    monkeypatch.setattr(weather_scheduler, "logger", logger)

    weather_scheduler.refresh_all_active_parks()

    assert refresh_calls == [101, 102]
    cleanup.assert_called_once_with(
        db=mock_db,
        park_id=102,
    )
    mock_db.rollback.assert_called_once_with()
    mock_db.close.assert_called_once_with()
    logger.info.assert_called_once()
    logger.exception.assert_not_called()


@pytest.mark.parametrize(
    ("job_name", "operation_name", "expected_message"),
    [
        (
            "refresh_all_active_parks",
            "refresh_park_forecast",
            "Weather refresh failed for park test-item-101",
        ),
        (
            "refresh_all_active_weather_stations",
            "refresh_observations",
            "Weather observation refresh failed for station 101",
        ),
        (
            "cleanup_all_active_weather_stations",
            "cleanup_old_observations",
            "Weather observation cleanup failed for station 101",
        ),
        (
            "refresh_all_active_water_temperature_stations",
            "refresh_water_temperature",
            "Water temperature refresh failed for station 101",
        ),
    ],
)
def test_scheduler_logs_without_reading_expired_identifiers(
    monkeypatch,
    caplog,
    job_name,
    operation_name,
    expected_message,
):
    rolled_back = False

    class ExpiringItem:
        def __init__(self, item_id):
            self._id = item_id

        @property
        def id(self):
            if rolled_back:
                raise AssertionError("ID accessed after rollback")
            return self._id

        @property
        def slug(self):
            if rolled_back:
                raise AssertionError("Slug accessed after rollback")
            return f"test-item-{self._id}"

    items = [ExpiringItem(101), ExpiringItem(102)]
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = items

    def rollback():
        nonlocal rolled_back
        rolled_back = True

    mock_db.rollback.side_effect = rollback

    original_error = RuntimeError("Original operation failure")
    operation = MagicMock(side_effect=[original_error, None])

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        operation_name,
        operation,
    )

    if job_name == "refresh_all_active_parks":
        cleanup = MagicMock()
        monkeypatch.setattr(
            weather_scheduler,
            "cleanup_old_forecast_snapshots",
            cleanup,
        )

    with caplog.at_level("ERROR", logger=weather_scheduler.__name__):
        getattr(weather_scheduler, job_name)()

    assert operation.call_count == 2
    mock_db.rollback.assert_called_once_with()
    mock_db.close.assert_called_once_with()

    records = [
        record for record in caplog.records if record.name == weather_scheduler.__name__
    ]

    assert len(records) == 1
    assert records[0].getMessage() == expected_message
    assert records[0].exc_info[1] is original_error

    if job_name == "refresh_all_active_parks":
        cleanup.assert_called_once_with(
            db=mock_db,
            park_id=102,
        )


@pytest.mark.parametrize(
    ("job_name", "operation_name"),
    [
        ("refresh_all_active_parks", "refresh_park_forecast"),
        ("refresh_all_active_weather_stations", "refresh_observations"),
        ("cleanup_all_active_weather_stations", "cleanup_old_observations"),
        (
            "refresh_all_active_water_temperature_stations",
            "refresh_water_temperature",
        ),
    ],
)
def test_scheduler_reports_item_outcomes(
    monkeypatch,
    job_name,
    operation_name,
):
    mock_db = MagicMock()
    is_park_job = job_name == "refresh_all_active_parks"

    items = [
        SimpleNamespace(id=101, slug="successful-item"),
        SimpleNamespace(id=102, slug="failing-item"),
    ]
    outcomes = [
        1,
        RuntimeError("Simulated item failure"),
    ]

    if is_park_job:
        items.append(SimpleNamespace(id=103, slug="busy-item"))
        outcomes.append(ForecastRefreshInProgress("Refresh already in progress"))

    mock_db.query.return_value.filter.return_value.all.return_value = items
    operation = MagicMock(side_effect=outcomes)

    monkeypatch.setattr(
        weather_scheduler,
        "SessionLocal",
        lambda: mock_db,
    )
    monkeypatch.setattr(
        weather_scheduler,
        operation_name,
        operation,
    )

    if is_park_job:
        cleanup = MagicMock()
        monkeypatch.setattr(
            weather_scheduler,
            "cleanup_old_forecast_snapshots",
            cleanup,
        )

    result = getattr(weather_scheduler, job_name)()

    assert result == {
        "succeeded": 1,
        "failed": 1,
        "skipped": 1 if is_park_job else 0,
    }
    assert operation.call_count == len(items)
    assert mock_db.rollback.call_count == (2 if is_park_job else 1)
    mock_db.close.assert_called_once_with()

    if is_park_job:
        cleanup.assert_called_once_with(
            db=mock_db,
            park_id=101,
        )
