from sqlalchemy import select

from app.models.weather_db import WeatherStationDB


def test_database_insert(db):
    station = WeatherStationDB(
        name="Test Weather Station",
        region="test",
        source="test",
        source_station_id=999999,
        is_active=True,
    )

    db.add(station)
    db.flush()

    saved_station = db.scalar(
        select(WeatherStationDB).where(WeatherStationDB.source_station_id == 999999)
    )

    assert saved_station is not None
    assert saved_station.name == "Test Weather Station"


def test_database_rollback(db):
    station = db.scalar(
        select(WeatherStationDB).where(WeatherStationDB.source_station_id == 999999)
    )

    assert station is None
