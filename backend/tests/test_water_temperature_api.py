from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.park_db import ParkDB
from app.models.water_temperature_db import (
    WaterTemperatureObservationDB,
    WaterTemperatureStationDB,
)

URL = "/api/parks/water-api-test-park/water-temperature"


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.delenv("WEATHER_REFRESH_API_KEY", raising=False)

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)

    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()


@pytest.fixture
def station(db):
    station = WaterTemperatureStationDB(
        name="Test Water Station",
        latitude=60.1707,
        longitude=24.8579,
        source="uiras",
        source_station_id="water-api-test-sensor",
        is_active=True,
    )
    db.add(station)
    db.flush()

    return station


@pytest.fixture
def park(db):
    park = ParkDB(
        name="Water API Test Park",
        slug="water-api-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.16905,
        longitude=24.833173,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )
    db.add(park)
    db.flush()

    return park


def add_observation(db, station, timestamp, temperature=11.06):
    observation = WaterTemperatureObservationDB(
        water_temperature_station_id=station.id,
        timestamp=timestamp,
        fetched_at=datetime.now(UTC),
        water_temperature=temperature,
    )
    db.add(observation)
    db.flush()

    return observation


def test_water_temperature_response(client, db, park, station):
    park.water_temperature_station = station
    measured_at = datetime.now(UTC) - timedelta(minutes=20)
    observation = add_observation(db, station, measured_at)

    response = client.get(URL)

    assert response.status_code == 200
    data = response.json()

    assert data["source"] == "uiras"
    assert data["source_station_id"] == "water-api-test-sensor"
    assert data["observation_location"] == "Test Water Station"
    assert data["latitude"] == 60.1707
    assert data["longitude"] == 24.8579
    assert data["water_temperature"] == 11.06
    assert data["is_stale"] is False
    assert datetime.fromisoformat(data["timestamp"]) == measured_at
    assert datetime.fromisoformat(data["fetched_at"]) == (observation.fetched_at)


def test_unknown_park(client):
    response = client.get("/api/parks/unknown-water-test-park/water-temperature")

    assert response.status_code == 404
    assert response.json() == {"detail": "Park not found"}


def test_station_not_configured(client, park):
    response = client.get(URL)

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Water temperature station not configured",
    }


def test_inactive_station(client, db, park, station):
    station.is_active = False
    park.water_temperature_station = station
    db.flush()

    response = client.get(URL)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Water temperature station is inactive",
    }


def test_no_observation(client, db, park, station):
    park.water_temperature_station = station
    db.flush()

    response = client.get(URL)

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Water temperature observation not found",
    }


def test_old_measurement_is_stale_despite_recent_fetch(
    client,
    db,
    park,
    station,
):
    park.water_temperature_station = station

    add_observation(
        db,
        station,
        datetime.now(UTC) - timedelta(hours=3),
    )

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json()["is_stale"] is True
    assert response.json()["water_temperature"] == 11.06


def test_returns_latest_measurement(client, db, park, station):
    park.water_temperature_station = station
    now = datetime.now(UTC)

    add_observation(db, station, now, temperature=12.0)
    add_observation(
        db,
        station,
        now - timedelta(hours=1),
        temperature=11.0,
    )

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json()["water_temperature"] == 12.0


def test_does_not_return_another_stations_measurement(
    client,
    db,
    park,
    station,
):
    other_station = WaterTemperatureStationDB(
        name="Other Water Station",
        latitude=60.2,
        longitude=24.9,
        source="uiras",
        source_station_id="other-water-api-test-sensor",
        is_active=True,
    )
    db.add(other_station)
    db.flush()

    park.water_temperature_station = station
    db.flush()
    add_observation(db, other_station, datetime.now(UTC))

    response = client.get(URL)

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Water temperature observation not found",
    }
