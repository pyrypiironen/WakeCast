from datetime import UTC, datetime, timedelta

import pytest

from app.models.water_temperature import (
    WaterTemperatureObservation,
    WaterTemperatureResponse,
)
from app.models.water_temperature_db import (
    WaterTemperatureObservationDB,
    WaterTemperatureStationDB,
)
from app.services.water_temperature_storage import (
    get_latest_water_temperature_observation,
    save_water_temperature_observations,
)


@pytest.fixture
def water_station(db):
    station = WaterTemperatureStationDB(
        name="Test Water Station",
        latitude=60.1707,
        longitude=24.8579,
        source="uiras",
        source_station_id="test-water-sensor",
        is_active=True,
    )
    db.add(station)
    db.flush()

    return station


def make_response(station, observations):
    return WaterTemperatureResponse(
        source=station.source,
        source_station_id=station.source_station_id,
        observation_location=station.name,
        latitude=station.latitude,
        longitude=station.longitude,
        observations=observations,
    )


def test_save_water_temperature(db, water_station):
    timestamp = datetime.now(UTC)
    weather = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=timestamp,
                water_temperature=11.06,
            ),
        ],
    )

    saved = save_water_temperature_observations(
        db,
        water_station,
        weather,
    )
    latest = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )

    assert saved == 1
    assert latest is not None
    assert latest.water_temperature_station_id == water_station.id
    assert latest.timestamp == timestamp
    assert latest.water_temperature == 11.06
    assert latest.fetched_at.tzinfo is not None


def test_repeated_fetch_does_not_duplicate(db, water_station):
    weather = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=datetime.now(UTC),
                water_temperature=11.06,
            ),
        ],
    )

    save_water_temperature_observations(db, water_station, weather)
    first = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )
    first_id = first.id

    save_water_temperature_observations(db, water_station, weather)
    db.expire_all()

    rows = (
        db.query(WaterTemperatureObservationDB)
        .filter(
            WaterTemperatureObservationDB.water_temperature_station_id
            == water_station.id
        )
        .all()
    )

    assert len(rows) == 1
    assert rows[0].id == first_id


def test_corrected_measurement_updates_existing_row(db, water_station):
    timestamp = datetime.now(UTC)
    weather = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=timestamp,
                water_temperature=11.06,
            ),
        ],
    )

    save_water_temperature_observations(db, water_station, weather)

    weather.observations[0].water_temperature = 11.12
    save_water_temperature_observations(db, water_station, weather)
    db.expire_all()

    rows = (
        db.query(WaterTemperatureObservationDB)
        .filter(
            WaterTemperatureObservationDB.water_temperature_station_id
            == water_station.id
        )
        .all()
    )

    assert len(rows) == 1
    assert rows[0].water_temperature == 11.12


def test_latest_uses_measurement_time(db, water_station):
    now = datetime.now(UTC)

    newer = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=now,
                water_temperature=12.0,
            ),
        ],
    )
    older = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=now - timedelta(hours=1),
                water_temperature=11.0,
            ),
        ],
    )

    # Retrieve the older measurement last.
    save_water_temperature_observations(db, water_station, newer)
    save_water_temperature_observations(db, water_station, older)
    db.expire_all()

    latest = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )

    assert latest.timestamp == now
    assert latest.water_temperature == 12.0


def test_empty_response_preserves_existing_measurement(db, water_station):
    weather = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=datetime.now(UTC),
                water_temperature=11.06,
            ),
        ],
    )
    save_water_temperature_observations(db, water_station, weather)

    weather.observations = []
    saved = save_water_temperature_observations(
        db,
        water_station,
        weather,
    )

    latest = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )

    assert saved == 0
    assert latest.water_temperature == 11.06


def test_rejects_wrong_sensor(db, water_station):
    weather = make_response(
        water_station,
        [
            WaterTemperatureObservation(
                timestamp=datetime.now(UTC),
                water_temperature=11.06,
            ),
        ],
    )
    weather.source_station_id = "different-sensor"

    with pytest.raises(ValueError, match="does not match"):
        save_water_temperature_observations(
            db,
            water_station,
            weather,
        )

    assert (
        get_latest_water_temperature_observation(
            db,
            water_station.id,
        )
        is None
    )


def test_no_measurement_for_station(db, water_station):
    assert (
        get_latest_water_temperature_observation(
            db,
            water_station.id,
        )
        is None
    )


@pytest.mark.parametrize("include_valid_reading", [True, False])
def test_latest_ignores_future_readings(
    db,
    water_station,
    include_valid_reading,
):
    now = datetime.now(UTC)

    future_reading = WaterTemperatureObservationDB(
        water_temperature_station_id=water_station.id,
        timestamp=now + timedelta(days=1),
        fetched_at=now,
        water_temperature=99.0,
    )
    db.add(future_reading)

    if include_valid_reading:
        db.add(
            WaterTemperatureObservationDB(
                water_temperature_station_id=water_station.id,
                timestamp=now - timedelta(minutes=10),
                fetched_at=now,
                water_temperature=11.0,
            )
        )

    db.flush()

    latest = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )

    if include_valid_reading:
        assert latest is not None
        assert latest.timestamp == now - timedelta(minutes=10)
        assert latest.water_temperature == 11.0
    else:
        assert latest is None


def test_latest_allows_small_clock_skew(db, water_station):
    now = datetime.now(UTC)
    timestamp = now + timedelta(minutes=4)

    db.add(
        WaterTemperatureObservationDB(
            water_temperature_station_id=water_station.id,
            timestamp=timestamp,
            fetched_at=now,
            water_temperature=11.0,
        )
    )
    db.flush()

    latest = get_latest_water_temperature_observation(
        db,
        water_station.id,
    )

    assert latest is not None
    assert latest.timestamp == timestamp
