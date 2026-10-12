from unittest.mock import Mock

import httpx
import pytest

from app.services import uiras
from app.services.weather_errors import WeatherProviderError

STATION_ID = "70B3D57050004CDB"


@pytest.fixture
def sensor_data():
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": STATION_ID,
                "geometry": {
                    "type": "Point",
                    "coordinates": [24.8579, 60.1707],
                },
                "properties": {
                    "name": "Lauttasaaren mattolaituri",
                    "measurement": {
                        "time": "2026-10-12T14:57:22+03:00",
                        "temp_water": 11.06,
                        "temp_in": 8.0,
                    },
                },
            },
        ],
    }


def test_parse_valid_measurement(sensor_data):
    weather = uiras.parse_water_temperature(
        sensor_data,
        station_id=STATION_ID,
    )

    assert weather.source == "uiras"
    assert weather.source_station_id == STATION_ID
    assert weather.observation_location == "Lauttasaaren mattolaituri"
    assert weather.latitude == 60.1707
    assert weather.longitude == 24.8579
    assert len(weather.observations) == 1

    observation = weather.observations[0]

    assert observation.water_temperature == 11.06
    assert observation.timestamp.isoformat() == ("2026-10-12T14:57:22+03:00")


def test_selects_requested_sensor(sensor_data):
    sensor_data["features"].insert(
        0,
        {
            "type": "Feature",
            "id": "other-sensor",
        },
    )

    weather = uiras.parse_water_temperature(
        sensor_data,
        station_id=STATION_ID,
    )

    assert weather.source_station_id == STATION_ID
    assert weather.observations[0].water_temperature == 11.06


@pytest.mark.parametrize(
    "measurement",
    [
        None,
        {},
        {"temp_water": None},
        {"temp_in": 8.0},
    ],
)
def test_missing_water_measurement_returns_empty_list(
    sensor_data,
    measurement,
):
    sensor_data["features"][0]["properties"]["measurement"] = measurement

    weather = uiras.parse_water_temperature(
        sensor_data,
        station_id=STATION_ID,
    )

    assert weather.observations == []


@pytest.mark.parametrize(
    "temperature",
    [float("nan"), float("inf"), float("-inf"), "invalid"],
)
def test_rejects_invalid_temperature(sensor_data, temperature):
    measurement = sensor_data["features"][0]["properties"]["measurement"]
    measurement["temp_water"] = temperature

    with pytest.raises(WeatherProviderError):
        uiras.parse_water_temperature(
            sensor_data,
            station_id=STATION_ID,
        )


@pytest.mark.parametrize(
    "timestamp",
    [
        "invalid",
        "2026-10-12T14:57:22",
        None,
    ],
)
def test_rejects_invalid_or_naive_timestamp(sensor_data, timestamp):
    measurement = sensor_data["features"][0]["properties"]["measurement"]
    measurement["time"] = timestamp

    with pytest.raises(WeatherProviderError):
        uiras.parse_water_temperature(
            sensor_data,
            station_id=STATION_ID,
        )


def test_unknown_sensor(sensor_data):
    with pytest.raises(
        WeatherProviderError,
        match="sensor was not found",
    ):
        uiras.parse_water_temperature(
            sensor_data,
            station_id="unknown-sensor",
        )


@pytest.mark.parametrize(
    "data",
    [
        None,
        [],
        {},
        {"type": "FeatureCollection", "features": None},
        {"type": "FeatureCollection", "features": [None]},
    ],
)
def test_rejects_invalid_collection(data):
    with pytest.raises(WeatherProviderError):
        uiras.parse_water_temperature(
            data,
            station_id=STATION_ID,
        )


@pytest.mark.parametrize(
    "geometry",
    [
        None,
        {"type": "LineString", "coordinates": [24.8579, 60.1707]},
        {"type": "Point", "coordinates": [24.8579]},
    ],
)
def test_rejects_invalid_sensor_geometry(sensor_data, geometry):
    sensor_data["features"][0]["geometry"] = geometry

    with pytest.raises(WeatherProviderError):
        uiras.parse_water_temperature(
            sensor_data,
            station_id=STATION_ID,
        )


def test_request_timeout(monkeypatch):
    get = Mock(side_effect=httpx.ReadTimeout("Simulated timeout"))
    monkeypatch.setattr(uiras.httpx, "get", get)

    with pytest.raises(WeatherProviderError, match="request failed"):
        uiras.get_water_temperature(STATION_ID)


def test_http_error(monkeypatch):
    request = httpx.Request("GET", uiras.UIRAS_URL)
    response = httpx.Response(503, request=request)

    monkeypatch.setattr(
        uiras.httpx,
        "get",
        Mock(return_value=response),
    )

    with pytest.raises(WeatherProviderError, match="request failed"):
        uiras.get_water_temperature(STATION_ID)


def test_invalid_json(monkeypatch):
    response = Mock()
    response.json.side_effect = ValueError("Invalid JSON")

    monkeypatch.setattr(
        uiras.httpx,
        "get",
        Mock(return_value=response),
    )

    with pytest.raises(WeatherProviderError, match="invalid JSON"):
        uiras.get_water_temperature(STATION_ID)


def test_successful_request(monkeypatch, sensor_data):
    response = Mock()
    response.json.return_value = sensor_data

    monkeypatch.setattr(
        uiras.httpx,
        "get",
        Mock(return_value=response),
    )

    weather = uiras.get_water_temperature(STATION_ID)

    assert weather.observations[0].water_temperature == 11.06
