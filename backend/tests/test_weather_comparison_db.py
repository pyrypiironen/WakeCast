from datetime import UTC, datetime, timedelta

import pytest

from app.models.park_db import ParkDB
from app.models.weather_db import (
    WeatherForecastDB,
    WeatherObservationDB,
    WeatherStationDB,
)
from app.services.weather_comparison import get_forecast_observation_pairs


def test_forecast_observation_matching(db):
    valid_time = datetime(2026, 10, 7, 12, tzinfo=UTC)

    station = WeatherStationDB(
        name="Test Station",
        region="test",
        source="fmi",
        source_station_id=999991,
        is_active=True,
    )
    db.add(station)
    db.flush()

    park = ParkDB(
        name="Test Park",
        slug="test-comparison-park",
        city="Test City",
        country="Finland",
        latitude=60.0,
        longitude=25.0,
        water_type="lake",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
        observation_station_id=station.id,
    )
    db.add(park)
    db.flush()

    forecast = WeatherForecastDB(
        park_id=park.id,
        timestamp=valid_time,
        fetched_at=valid_time - timedelta(hours=24),
        forecast_location="Test Park",
        temperature=12.0,
        wind_speed=6.0,
        wind_gust=8.0,
        wind_direction=180.0,
        precipitation=0.0,
        cloudiness=50.0,
        source="harmonie",
    )

    observation = WeatherObservationDB(
        weather_station_id=station.id,
        timestamp=valid_time,
        fetched_at=valid_time + timedelta(minutes=10),
        observation_location="Test Station",
        temperature=11.0,
        wind_speed=5.0,
        wind_gust=7.0,
        wind_direction=190.0,
        precipitation=0.0,
        cloudiness=40.0,
        resolution_minutes=10,
        is_aggregated=False,
        source="fmi",
    )

    db.add_all([forecast, observation])
    db.flush()

    pairs = get_forecast_observation_pairs(
        db=db,
        park_id=park.id,
        start_time=valid_time - timedelta(hours=1),
        end_time=valid_time + timedelta(hours=1),
    )

    assert len(pairs) == 1

    pair = pairs[0]

    assert pair.forecast.wind_speed == 6.0
    assert pair.observation.wind_speed == 5.0
    assert pair.lead_time_hours == 24.0
    assert pair.forecast.source == "harmonie"
    assert pair.observation.weather_station_id == station.id


@pytest.mark.parametrize(
    "scenario",
    [
        "wrong_station",
        "wrong_timestamp",
        "forecast_fetched_too_late",
    ],
)
def test_forecast_observation_invalid_matches(db, scenario):
    valid_time = datetime(2026, 10, 7, 12, tzinfo=UTC)

    station = WeatherStationDB(
        name="Reference Station",
        region="test",
        source="fmi",
        source_station_id=999992,
        is_active=True,
    )
    other_station = WeatherStationDB(
        name="Other Station",
        region="other",
        source="fmi",
        source_station_id=999993,
        is_active=True,
    )

    db.add_all([station, other_station])
    db.flush()

    park = ParkDB(
        name="Test Park",
        slug="test-invalid-matches",
        city="Test City",
        country="Finland",
        latitude=60.0,
        longitude=25.0,
        water_type="lake",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
        observation_station_id=station.id,
    )
    db.add(park)
    db.flush()

    forecast = WeatherForecastDB(
        park_id=park.id,
        timestamp=valid_time,
        fetched_at=(
            valid_time + timedelta(minutes=10)
            if scenario == "forecast_fetched_too_late"
            else valid_time - timedelta(hours=24)
        ),
        forecast_location="Test Park",
        temperature=12.0,
        wind_speed=6.0,
        wind_gust=8.0,
        wind_direction=180.0,
        precipitation=0.0,
        cloudiness=50.0,
        source="harmonie",
    )

    observation = WeatherObservationDB(
        weather_station_id=(
            other_station.id if scenario == "wrong_station" else station.id
        ),
        timestamp=(
            valid_time + timedelta(minutes=10)
            if scenario == "wrong_timestamp"
            else valid_time
        ),
        fetched_at=valid_time + timedelta(minutes=20),
        observation_location="Test Station",
        temperature=11.0,
        wind_speed=5.0,
        wind_gust=7.0,
        wind_direction=190.0,
        precipitation=0.0,
        cloudiness=40.0,
        resolution_minutes=10,
        is_aggregated=False,
        source="fmi",
    )

    db.add_all([forecast, observation])
    db.flush()

    pairs = get_forecast_observation_pairs(
        db=db,
        park_id=park.id,
        start_time=valid_time - timedelta(hours=1),
        end_time=valid_time + timedelta(hours=1),
    )

    assert pairs == []


def test_comparison_park_not_found(db):
    start_time = datetime(2026, 10, 7, tzinfo=UTC)
    end_time = start_time + timedelta(days=1)

    with pytest.raises(ValueError, match="not found"):
        get_forecast_observation_pairs(
            db=db,
            park_id=-1,
            start_time=start_time,
            end_time=end_time,
        )


def test_comparison_park_without_reference_station(db):
    park = ParkDB(
        name="Park Without Station",
        slug="test-no-reference-station",
        city="Test City",
        country="Finland",
        latitude=60.0,
        longitude=25.0,
        water_type="lake",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
        observation_station_id=None,
    )

    db.add(park)
    db.flush()

    start_time = datetime(2026, 10, 7, tzinfo=UTC)
    end_time = start_time + timedelta(days=1)

    with pytest.raises(
        ValueError,
        match="has no reference observation station",
    ):
        get_forecast_observation_pairs(
            db=db,
            park_id=park.id,
            start_time=start_time,
            end_time=end_time,
        )
