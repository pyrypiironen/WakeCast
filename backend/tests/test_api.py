from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.park_db import ParkDB
from app.models.weather import WeatherForecast, WeatherResponse
from app.models.weather_db import WeatherForecastDB
from app.services import weather_forecast
from app.services.weather_errors import WeatherProviderError


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setenv(
        "WEATHER_REFRESH_API_KEY",
        "test-refresh-api-key",
    )

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        # No context manager: avoid starting the background scheduler.
        yield TestClient(
            app,
            headers={"X-API-Key": "test-refresh-api-key"},
        )
    finally:
        app.dependency_overrides.clear()


def test_get_park_from_database(client, db):
    park = ParkDB(
        name="API Test Park",
        slug="api-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    response = client.get("/api/parks/api-test-park")

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "API Test Park"
    assert data["slug"] == "api-test-park"
    assert data["city"] == "Espoo"


def test_get_nonexistent_park(client):
    response = client.get("/api/parks/nonexistent-test-park")

    assert response.status_code == 404
    assert response.json()["detail"] == "Park not found"


def test_get_park_weather_from_database(client, db):
    park = ParkDB(
        name="Weather API Test Park",
        slug="weather-api-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    forecast = WeatherForecastDB(
        park_id=park.id,
        timestamp=datetime.now(timezone.utc) + timedelta(hours=1),
        fetched_at=datetime.now(timezone.utc),
        forecast_location="Weather API Test Park",
        temperature=15.0,
        wind_speed=5.0,
        wind_gust=8.0,
        wind_direction=180.0,
        precipitation=0.0,
        precipitation_probability=20.0,
        cloudiness=40.0,
        source="harmonie",
    )

    db.add(forecast)
    db.flush()

    response = client.get("/api/parks/weather-api-test-park/weather")

    assert response.status_code == 200

    data = response.json()

    assert data["forecast_location"] == "Weather API Test Park"
    assert len(data["forecasts"]) == 1
    assert data["forecasts"][0]["temperature"] == 15.0
    assert data["forecasts"][0]["wind_speed"] == 5.0
    assert data["forecasts"][0]["source"] == "harmonie"


def test_get_park_weather_without_forecast(client, db):
    park = ParkDB(
        name="Park Without Forecast",
        slug="park-without-forecast",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    response = client.get("/api/parks/park-without-forecast/weather")

    assert response.status_code == 404
    assert response.json() == {"detail": "Weather forecast not found"}


def test_get_park_weather_stale_forecast(client, db):
    park = ParkDB(
        name="Stale Weather Test Park",
        slug="stale-weather-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    forecast = WeatherForecastDB(
        park_id=park.id,
        timestamp=datetime.now(timezone.utc) + timedelta(hours=1),
        fetched_at=datetime.now(timezone.utc) - timedelta(hours=2),
        forecast_location="Stale Weather Test Park",
        temperature=15.0,
        wind_speed=5.0,
        wind_gust=8.0,
        wind_direction=180.0,
        precipitation=0.0,
        precipitation_probability=20.0,
        cloudiness=40.0,
        source="harmonie",
    )

    db.add(forecast)
    db.flush()

    response = client.get("/api/parks/stale-weather-test-park/weather")

    assert response.status_code == 503
    assert response.json() == {"detail": "Weather forecast is stale"}


def test_get_weather_nonexistent_park(client):
    response = client.get("/api/parks/nonexistent-weather-test-park/weather")

    assert response.status_code == 404
    assert response.json() == {"detail": "Park not found"}


def test_manual_forecast_refresh(client, db, monkeypatch):
    park = ParkDB(
        name="Refresh API Test Park",
        slug="refresh-api-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    calls = []

    def fake_refresh(db, park):
        calls.append(park.id)
        return 12

    monkeypatch.setattr(
        "app.main.refresh_park_forecast",
        fake_refresh,
    )

    response = client.post("/api/parks/refresh-api-test-park/weather/refresh")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "saved_rows": 12,
    }
    assert calls == [park.id]


def test_manual_forecast_refresh_nonexistent_park(client, monkeypatch):
    def fake_refresh(db, park):
        pytest.fail("Refresh service must not be called")

    monkeypatch.setattr(
        "app.main.refresh_park_forecast",
        fake_refresh,
    )

    response = client.post("/api/parks/nonexistent-refresh-test-park/weather/refresh")

    assert response.status_code == 404
    assert response.json() == {"detail": "Park not found"}


def test_refresh_weather_provider_failure(client, db, monkeypatch):
    from app import main

    park = ParkDB(
        name="Provider Failure Park",
        slug="provider-failure-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    def failing_refresh(db, park):
        raise WeatherProviderError("Simulated FMI failure")

    monkeypatch.setattr(
        main,
        "refresh_park_forecast",
        failing_refresh,
    )

    response = client.post("/api/parks/provider-failure-park/weather/refresh")

    assert response.status_code == 502
    assert response.json() == {"detail": "Weather forecast provider unavailable"}
    assert "Simulated FMI failure" not in response.text


def test_refresh_weather_database_failure(client, db, monkeypatch):
    from sqlalchemy.exc import OperationalError

    from app import main

    park = ParkDB(
        name="Database Failure Park",
        slug="database-failure-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    def failing_refresh(db, park):
        raise OperationalError(
            "INSERT INTO weather_forecasts ...",
            {},
            Exception("Simulated database failure"),
        )

    monkeypatch.setattr(
        main,
        "refresh_park_forecast",
        failing_refresh,
    )

    response = client.post("/api/parks/database-failure-park/weather/refresh")

    assert response.status_code == 500
    assert response.json() == {"detail": "Weather refresh failed"}
    assert "Simulated database failure" not in response.text


def test_refresh_weather_unexpected_failure(client, db, monkeypatch):
    from app import main

    park = ParkDB(
        name="Unexpected Failure Park",
        slug="unexpected-failure-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )

    db.add(park)
    db.flush()

    def failing_refresh(db, park):
        raise RuntimeError("Simulated internal failure")

    monkeypatch.setattr(
        main,
        "refresh_park_forecast",
        failing_refresh,
    )

    response = client.post("/api/parks/unexpected-failure-park/weather/refresh")

    assert response.status_code == 500
    assert response.json() == {"detail": "Weather refresh failed"}
    assert "Simulated internal failure" not in response.text


def test_refresh_archives_both_providers_and_api_merges(client, db, monkeypatch):
    park = ParkDB(
        name="Archive Test Park",
        slug="archive-test-park",
        city="Espoo",
        country="Finland",
        latitude=60.0,
        longitude=24.0,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )
    db.add(park)
    db.flush()
    park_id = park.id

    timestamp = datetime.now(timezone.utc) + timedelta(hours=1)

    def point(source, valid_time, wind_speed):
        return WeatherForecast(
            timestamp=valid_time,
            temperature=12.0,
            wind_speed=wind_speed,
            wind_gust=9.0,
            wind_direction=180.0,
            precipitation=0.0,
            precipitation_probability=None,
            cloudiness=50.0,
            source=source,
        )

    fmi = WeatherResponse(
        forecast_location="Archive Test Park",
        forecasts=[
            point("harmonie", timestamp, 5.0),
        ],
    )
    ecmwf = WeatherResponse(
        forecast_location="Unknown",
        forecasts=[
            point("ecmwf", timestamp, 7.0),
            point("ecmwf", timestamp + timedelta(hours=1), 8.0),
        ],
    )

    monkeypatch.setattr(
        weather_forecast,
        "get_harmonie_forecast",
        lambda latitude, longitude: fmi,
    )
    monkeypatch.setattr(
        weather_forecast,
        "get_ecmwf_forecast",
        lambda latitude, longitude: ecmwf,
    )

    refresh_response = client.post("/api/parks/archive-test-park/weather/refresh")

    assert refresh_response.status_code == 200
    assert refresh_response.json() == {
        "status": "ok",
        "saved_rows": 3,
    }

    db.expire_all()
    rows = (
        db.query(WeatherForecastDB).filter(WeatherForecastDB.park_id == park_id).all()
    )

    assert len(rows) == 3
    assert len({row.fetched_at for row in rows}) == 1

    overlapping_rows = [row for row in rows if row.timestamp == timestamp]
    assert {row.source: row.wind_speed for row in overlapping_rows} == {
        "harmonie": 5.0,
        "ecmwf": 7.0,
    }

    assert {row.source: row.forecast_location for row in rows} == {
        "harmonie": "Archive Test Park",
        "ecmwf": "Unknown",
    }

    response = client.get("/api/parks/archive-test-park/weather")

    assert response.status_code == 200
    data = response.json()

    assert data["forecast_location"] == "Archive Test Park"
    assert len(data["forecasts"]) == 2
    assert [item["wind_speed"] for item in data["forecasts"]] == [5.0, 8.0]
    assert [item["source"] for item in data["forecasts"]] == [
        "harmonie",
        "ecmwf",
    ]
    assert [
        datetime.fromisoformat(item["timestamp"]) for item in data["forecasts"]
    ] == [
        timestamp,
        timestamp + timedelta(hours=1),
    ]
