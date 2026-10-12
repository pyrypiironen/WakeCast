from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.park_db import ParkDB
from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)
from app.models.weather_db import (
    WeatherForecastDB,
    WeatherObservationDB,
    WeatherStationDB,
)
from app.services.weather_storage import (
    cleanup_old_forecast_snapshots,
    cleanup_old_observations,
    save_observations,
)


def test_save_observations_upsert(db):
    station = WeatherStationDB(
        name="Storage Test Station",
        region="test",
        source="fmi",
        source_station_id=999994,
        is_active=True,
    )
    db.add(station)
    db.flush()

    timestamp = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)

    first_response = WeatherObservationResponse(
        observation_station_id=station.id,
        observation_location="Storage Test Station",
        observations=[
            WeatherObservation(
                timestamp=timestamp,
                temperature=10.0,
                wind_speed=5.0,
                wind_gust=7.0,
                wind_direction=180.0,
                precipitation=0.0,
                cloudiness=50.0,
            )
        ],
    )

    assert save_observations(db, first_response, station.id) == 1

    updated_response = WeatherObservationResponse(
        observation_station_id=station.id,
        observation_location="Storage Test Station",
        observations=[
            WeatherObservation(
                timestamp=timestamp,
                temperature=12.0,
                wind_speed=6.0,
                wind_gust=8.0,
                wind_direction=190.0,
                precipitation=0.0,
                cloudiness=40.0,
            )
        ],
    )

    assert save_observations(db, updated_response, station.id) == 1

    rows = db.scalars(
        select(WeatherObservationDB).where(
            WeatherObservationDB.weather_station_id == station.id
        )
    ).all()

    assert len(rows) == 1
    assert rows[0].temperature == 12.0
    assert rows[0].wind_speed == 6.0
    assert rows[0].cloudiness == 40.0


def test_cleanup_old_observations(db):
    now = datetime.now(timezone.utc)
    old_hour = (now - timedelta(days=200)).replace(minute=0, second=0, microsecond=0)
    recent_hour = (now - timedelta(days=1)).replace(minute=0, second=0, microsecond=0)

    stations = [
        WeatherStationDB(
            name=f"Retention Station {i}",
            region="test",
            source="fmi",
            source_station_id=999995 + i,
            is_active=True,
        )
        for i in range(2)
    ]
    db.add_all(stations)
    db.flush()

    def make_observation(station_id, timestamp):
        return WeatherObservationDB(
            weather_station_id=station_id,
            timestamp=timestamp,
            fetched_at=now,
            observation_location="Test Station",
            temperature=10.0,
            wind_speed=5.0,
            source="fmi",
            resolution_minutes=10,
            is_aggregated=False,
        )

    db.add_all(
        [
            make_observation(stations[0].id, old_hour),
            make_observation(stations[0].id, old_hour + timedelta(minutes=10)),
            make_observation(stations[0].id, recent_hour),
            make_observation(stations[0].id, recent_hour + timedelta(minutes=10)),
            make_observation(stations[1].id, old_hour + timedelta(minutes=10)),
        ]
    )
    db.flush()

    deleted = cleanup_old_observations(db, stations[0].id)

    assert deleted == 1

    remaining = db.scalars(
        select(WeatherObservationDB)
        .where(WeatherObservationDB.weather_station_id == stations[0].id)
        .order_by(WeatherObservationDB.timestamp)
    ).all()

    assert len(remaining) == 3
    assert remaining[0].resolution_minutes == 60
    assert remaining[1].resolution_minutes == 10
    assert remaining[2].resolution_minutes == 10

    other_station_rows = db.scalars(
        select(WeatherObservationDB).where(
            WeatherObservationDB.weather_station_id == stations[1].id
        )
    ).all()

    assert len(other_station_rows) == 1
    assert other_station_rows[0].resolution_minutes == 10


def test_cleanup_old_forecast_snapshots(db):
    now = datetime.now(timezone.utc)
    old_hour = (now - timedelta(days=10)).replace(minute=0, second=0, microsecond=0)
    recent_time = now - timedelta(days=1)

    park = ParkDB(
        name="Forecast Retention Park",
        slug="test-forecast-retention",
        city="Test City",
        country="Finland",
        latitude=60.0,
        longitude=25.0,
        water_type="lake",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )
    db.add(park)
    db.flush()

    def make_forecast(fetched_at):
        return WeatherForecastDB(
            park_id=park.id,
            timestamp=now + timedelta(days=1),
            fetched_at=fetched_at,
            forecast_location="Test Park",
            temperature=10.0,
            wind_speed=5.0,
            wind_gust=7.0,
            wind_direction=180.0,
            precipitation=0.0,
            cloudiness=50.0,
            source="harmonie",
        )

    first_old = old_hour + timedelta(minutes=5)
    second_old = old_hour + timedelta(minutes=20)

    db.add_all(
        [
            make_forecast(first_old),
            make_forecast(second_old),
            make_forecast(recent_time),
        ]
    )
    db.flush()

    deleted = cleanup_old_forecast_snapshots(db, park.id)

    assert deleted == 1

    remaining = db.scalars(
        select(WeatherForecastDB).where(WeatherForecastDB.park_id == park.id)
    ).all()

    assert len(remaining) == 2
    assert {row.fetched_at for row in remaining} == {
        first_old,
        recent_time,
    }


def test_save_empty_observations(db):
    station = WeatherStationDB(
        name="Empty Response Station",
        region="test",
        source="fmi",
        source_station_id=999998,
        is_active=True,
    )
    db.add(station)
    db.flush()

    response = WeatherObservationResponse(
        observation_station_id=station.id,
        observation_location="Empty Response Station",
        observations=[],
    )

    saved = save_observations(
        db=db,
        weather=response,
        weather_station_id=station.id,
    )

    assert saved == 0

    rows = db.scalars(
        select(WeatherObservationDB).where(
            WeatherObservationDB.weather_station_id == station.id
        )
    ).all()

    assert rows == []


def test_observation_upsert_keeps_stations_separate(db):
    stations = [
        WeatherStationDB(
            name=f"Isolation Station {i}",
            region="test",
            source="fmi",
            source_station_id=999980 + i,
            is_active=True,
        )
        for i in range(2)
    ]
    db.add_all(stations)
    db.flush()

    timestamp = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)

    for station, temperature in zip(stations, [10.0, 20.0]):
        response = WeatherObservationResponse(
            observation_station_id=station.id,
            observation_location=station.name,
            observations=[
                WeatherObservation(
                    timestamp=timestamp,
                    temperature=temperature,
                    wind_speed=5.0,
                    wind_gust=7.0,
                    wind_direction=180.0,
                    precipitation=0.0,
                    cloudiness=50.0,
                )
            ],
        )

        assert save_observations(db, response, station.id) == 1

    rows = db.scalars(
        select(WeatherObservationDB).where(
            WeatherObservationDB.timestamp == timestamp,
            WeatherObservationDB.weather_station_id.in_(
                [station.id for station in stations]
            ),
        )
    ).all()

    assert len(rows) == 2

    temperatures = {row.weather_station_id: row.temperature for row in rows}

    assert temperatures[stations[0].id] == 10.0
    assert temperatures[stations[1].id] == 20.0
