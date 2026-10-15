from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_park_or_404
from app.main import app
from app.models.park_db import ParkDB
from app.models.water_temperature_db import (
    WaterTemperatureObservationDB,
    WaterTemperatureStationDB,
)
from app.models.weather_db import WeatherObservationDB, WeatherStationDB


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        # Avoid starting scheduled weather refresh jobs.
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def park(db):
    park = ParkDB(
        name="History API Park",
        slug="history-api-park",
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
    return park


def history_params(start, end):
    return {"start_time": start.isoformat(), "end_time": end.isoformat()}


def test_weather_history_returns_only_own_station_and_preserves_nulls(client, db, park):
    now = datetime.now(UTC).replace(microsecond=0)
    station = WeatherStationDB(
        name="Station A",
        region="test",
        source="fmi",
        source_station_id=991001,
        is_active=True,
    )
    other_station = WeatherStationDB(
        name="Station B",
        region="test",
        source="fmi",
        source_station_id=991002,
        is_active=True,
    )
    db.add_all([station, other_station])
    db.flush()
    park.observation_station = station

    for target_station, hours, temperature in [
        (station, -2, None),
        (station, -3, 12.0),
        (station, -4, 11.0),
        (other_station, -3, 99.0),
    ]:
        db.add(
            WeatherObservationDB(
                weather_station_id=target_station.id,
                timestamp=now + timedelta(hours=hours),
                fetched_at=now,
                observation_location=target_station.name,
                temperature=temperature,
                wind_speed=3.5,
                wind_gust=5.0,
                wind_direction=270.0,
                precipitation=1.2,
                cloudiness=80.0,
                source="fmi",
                resolution_minutes=10,
                is_aggregated=False,
            )
        )
    db.flush()

    response = client.get(
        "/api/parks/history-api-park/weather/observations",
        params=history_params(now - timedelta(hours=3), now),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["station_name"] == "Station A"
    assert data["source_station_id"] == 991001
    assert data["timezone"] == "Europe/Helsinki"
    assert len(data["observations"]) == 2
    assert data["observations"][0]["temperature"] == 12.0
    assert data["observations"][1]["temperature"] is None
    assert data["observations"][0]["precipitation"] == 1.2
    assert data["observations"][0]["resolution_minutes"] == 10


def test_water_history_time_filter_and_station_attribution(client, db, park):
    now = datetime.now(UTC).replace(microsecond=0)
    station = WaterTemperatureStationDB(
        name="Nearby Water Station",
        latitude=60.17,
        longitude=24.85,
        source="uiras",
        source_station_id="SENSOR-A",
        is_active=True,
    )
    other_station = WaterTemperatureStationDB(
        name="Other Station",
        latitude=60.2,
        longitude=24.9,
        source="uiras",
        source_station_id="SENSOR-B",
        is_active=True,
    )
    db.add_all([station, other_station])
    db.flush()
    park.water_temperature_station = station

    for target, hour, temperature in [
        (station, -3, 12.0),
        (station, -1, 13.0),
        (station, 2, 99.0),
        (other_station, -1, 99.0),
    ]:
        db.add(
            WaterTemperatureObservationDB(
                water_temperature_station_id=target.id,
                timestamp=now + timedelta(hours=hour),
                fetched_at=now,
                water_temperature=temperature,
            )
        )
    db.flush()

    response = client.get(
        "/api/parks/history-api-park/water-temperature/history",
        params=history_params(now - timedelta(hours=2), now + timedelta(hours=3)),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "uiras"
    assert data["observation_location"] == "Nearby Water Station"
    assert data["source_station_id"] == "SENSOR-A"
    assert [p["water_temperature"] for p in data["observations"]] == [13.0]
    assert data["preceding_observation"]["water_temperature"] == 12.0


@pytest.mark.parametrize(
    "endpoint",
    [
        "/api/parks/history-api-park/weather/observations",
        "/api/parks/history-api-park/water-temperature/history",
    ],
)
def test_history_without_configured_station(client, park, endpoint):
    now = datetime.now(UTC)
    response = client.get(
        endpoint,
        params=history_params(now - timedelta(hours=1), now),
    )
    assert response.status_code == 404
    assert "not configured" in response.json()["detail"]


@pytest.mark.parametrize(
    "endpoint",
    [
        "/api/parks/history-api-park/weather/observations",
        "/api/parks/history-api-park/water-temperature/history",
    ],
)
def test_history_requires_aware_bounded_valid_range(client, park, endpoint):
    now = datetime.now(UTC)
    cases = [
        {"start_time": "2026-10-01T12:00:00", "end_time": now.isoformat()},
        history_params(now, now),
        history_params(now, now - timedelta(hours=1)),
        history_params(now - timedelta(days=32), now),
    ]
    for params in cases:
        assert client.get(endpoint, params=params).status_code == 422


def test_weather_history_empty_when_station_has_no_readings(client, db, park):
    now = datetime.now(UTC)
    station = WeatherStationDB(
        name="Empty Station",
        region="test",
        source="fmi",
        source_station_id=991003,
        is_active=True,
    )
    db.add(station)
    db.flush()
    park.observation_station = station
    db.flush()

    response = client.get(
        "/api/parks/history-api-park/weather/observations",
        params=history_params(now - timedelta(days=1), now),
    )
    assert response.status_code == 200
    assert response.json()["observations"] == []


def test_unknown_park_returns_404(client):
    now = datetime.now(UTC)
    response = client.get(
        "/api/parks/unknown-park/weather/observations",
        params=history_params(now - timedelta(hours=1), now),
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Park not found"}


@pytest.mark.parametrize("kind", ["weather", "water"])
def test_inactive_station_returns_503(client, db, park, kind):
    now = datetime.now(UTC)
    if kind == "weather":
        station = WeatherStationDB(
            name="Inactive",
            region="test",
            source="fmi",
            source_station_id=991004,
            is_active=False,
        )
        park.observation_station = station
        endpoint = "/api/parks/history-api-park/weather/observations"
    else:
        station = WaterTemperatureStationDB(
            name="Inactive",
            latitude=60,
            longitude=24,
            source="uiras",
            source_station_id="INACTIVE",
            is_active=False,
        )
        park.water_temperature_station = station
        endpoint = "/api/parks/history-api-park/water-temperature/history"

    db.add(station)
    db.flush()
    response = client.get(
        endpoint,
        params=history_params(now - timedelta(hours=1), now),
    )
    assert response.status_code == 503


@pytest.fixture(params=["weather", "water"])
def history_station(request, db, park):
    if request.param == "weather":
        station = WeatherStationDB(
            name="Assigned Weather Station",
            region="test",
            source="fmi",
            source_station_id=991010,
            is_active=True,
        )
        park.observation_station = station
        model = WeatherObservationDB
        foreign_key = "weather_station_id"
        suffix = "weather/observations"
        values = {
            "observation_location": "Original measurement location",
            "source": "fmi",
            "temperature": None,
            "precipitation": 0.0,
            "resolution_minutes": 60,
            "is_aggregated": False,
        }
    else:
        station = WaterTemperatureStationDB(
            name="Assigned Water Station",
            latitude=60.17,
            longitude=24.85,
            source="uiras",
            source_station_id="BOUNDARY-SENSOR",
            is_active=True,
        )
        park.water_temperature_station = station
        model = WaterTemperatureObservationDB
        foreign_key = "water_temperature_station_id"
        suffix = "water-temperature/history"
        values = {"water_temperature": 12.5}
    db.add(station)
    db.flush()

    def add(timestamp, fetched_at):
        db.add(
            model(
                **{foreign_key: station.id},
                timestamp=timestamp,
                fetched_at=fetched_at,
                **values,
            )
        )
        db.flush()

    return f"/api/parks/{park.slug}/{suffix}", add, request.param


def test_history_offsets_half_open_range_and_metadata(
    client, db, history_station, monkeypatch
):
    from unittest.mock import Mock
    from zoneinfo import ZoneInfo

    from sqlalchemy import event

    endpoint, add, kind = history_station
    # DST transition: two distinct instants both labelled 03:30 in Helsinki.
    start = datetime(2025, 10, 26, 0, 30, tzinfo=UTC)
    end = start + timedelta(hours=2)
    timestamps = [start - timedelta(seconds=1), start, start + timedelta(hours=1), end]
    fetched_at = end + timedelta(hours=1)
    for timestamp in reversed(timestamps):
        add(timestamp, fetched_at)
    monkeypatch.setattr(db, "commit", Mock(side_effect=AssertionError("GET committed")))
    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split()[0].upper())

    connection = db.connection()
    event.listen(connection, "before_cursor_execute", record_sql)
    try:
        response = client.get(
            endpoint,
            params=history_params(
                start.astimezone(ZoneInfo("Europe/Helsinki")),
                end,
            ),
        )
    finally:
        event.remove(connection, "before_cursor_execute", record_sql)
    assert response.status_code == 200
    assert statements and set(statements) == {"SELECT"}
    data = response.json()
    assert data["timezone"] == "Europe/Helsinki"
    points = data["observations"]
    assert [datetime.fromisoformat(p["timestamp"]) for p in points] == timestamps[1:3]
    assert all(datetime.fromisoformat(p["fetched_at"]) == fetched_at for p in points)
    if kind == "weather":
        assert data["source"] == "fmi"
        assert all(p["source"] == "fmi" for p in points)
        assert all(
            p["observation_location"] == "Original measurement location" for p in points
        )
        assert all(p["temperature"] is None and p["precipitation"] == 0 for p in points)
        assert all(
            p["resolution_minutes"] == 60 and not p["is_aggregated"] for p in points
        )
        assert all("precipitation_probability" not in p for p in points)
    else:
        assert data["latitude"] == 60.17 and data["longitude"] == 24.85
        assert (
            datetime.fromisoformat(data["preceding_observation"]["timestamp"])
            == timestamps[0]
        )


def test_history_empty_and_maximum_range(client, history_station):
    endpoint, _, kind = history_station
    end = datetime(2025, 10, 26, tzinfo=UTC)
    response = client.get(
        endpoint, params=history_params(end - timedelta(days=31), end)
    )
    assert response.status_code == 200
    assert response.json()["observations"] == []
    if kind == "water":
        assert response.json()["preceding_observation"] is None


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"start_time": "2025-10-01T00:00:00Z"},
        {"end_time": "2025-10-02T00:00:00Z"},
        {"start_time": "not-a-date", "end_time": "2025-10-02T00:00:00Z"},
        {"start_time": "2025-10-01T00:00:00Z", "end_time": "2025-10-02T00:00:00"},
        {
            "start_time": "2025-10-01T00:00:00Z",
            "end_time": "2025-11-01T00:00:00.000001Z",
        },
    ],
)
@pytest.mark.parametrize(
    "suffix", ["weather/observations", "water-temperature/history"]
)
def test_history_missing_or_invalid_parameters(validation_client, suffix, params):
    endpoint = f"/api/parks/history-api-park/{suffix}"
    assert validation_client.get(endpoint, params=params).status_code == 422


def test_history_excludes_future_rows_and_future_preceding(
    client, history_station, monkeypatch
):
    from app.routes import history

    now = datetime(2025, 10, 26, 12, tzinfo=UTC)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)

    monkeypatch.setattr(history, "datetime", Clock)
    endpoint, add, kind = history_station
    add(now - timedelta(hours=1), now)
    add(now + timedelta(hours=1), now)
    response = client.get(
        endpoint,
        params=history_params(
            now - timedelta(hours=2),
            now + timedelta(hours=2),
        ),
    )
    assert response.status_code == 200
    assert len(response.json()["observations"]) == 1
    future = client.get(
        endpoint,
        params=history_params(
            now + timedelta(hours=2),
            now + timedelta(hours=3),
        ),
    )
    assert future.status_code == 200
    assert future.json()["observations"] == []
    if kind == "water":
        assert future.json()["preceding_observation"] is None


def test_water_history_unknown_park(client):
    response = client.get(
        "/api/parks/unknown-park/water-temperature/history",
        params={
            "start_time": "2025-10-01T00:00:00Z",
            "end_time": "2025-10-02T00:00:00Z",
        },
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Park not found"}


@pytest.fixture
def validation_client():
    from types import SimpleNamespace

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[get_park_or_404] = lambda: SimpleNamespace()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
