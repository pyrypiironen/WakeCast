import pytest
from fastapi.testclient import TestClient

from datetime import datetime, timedelta, timezone

from app.models.weather_db import WeatherForecastDB

from app.database import get_db
from app.main import app
from app.models.park_db import ParkDB


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

    response = client.get(
        "/api/parks/weather-api-test-park/weather"
    )

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

    response = client.get(
        "/api/parks/park-without-forecast/weather"
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Weather forecast not found"
    }



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

    response = client.get(
        "/api/parks/stale-weather-test-park/weather"
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Weather forecast is stale"
    }



def test_get_weather_nonexistent_park(client):
    response = client.get(
        "/api/parks/nonexistent-weather-test-park/weather"
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Park not found"
    }



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

    response = client.post(
        "/api/parks/refresh-api-test-park/weather/refresh"
    )

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

    response = client.post(
        "/api/parks/nonexistent-refresh-test-park/weather/refresh"
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Park not found"
    }



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
        raise RuntimeError("Simulated FMI failure")

    monkeypatch.setattr(
        main,
        "refresh_park_forecast",
        failing_refresh,
    )

    response = client.post(
        "/api/parks/provider-failure-park/weather/refresh"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Weather forecast provider unavailable"
    }
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

    response = client.post(
        "/api/parks/database-failure-park/weather/refresh"
    )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Weather refresh failed"
    }
    assert "Simulated database failure" not in response.text
