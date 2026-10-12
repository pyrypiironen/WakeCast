from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.weather import WeatherForecast, WeatherObservation

WEATHER_FIELDS = [
    "temperature",
    "wind_speed",
    "wind_gust",
    "wind_direction",
    "precipitation",
    "cloudiness",
]


def make_forecast_data():
    return {
        "timestamp": datetime.now(timezone.utc),
        "temperature": 12.0,
        "wind_speed": 4.0,
        "wind_gust": 7.0,
        "wind_direction": 180.0,
        "precipitation": 0.0,
        "precipitation_probability": 25.0,
        "cloudiness": 50.0,
        "source": "harmonie",
    }


@pytest.mark.parametrize(
    "field",
    WEATHER_FIELDS + ["precipitation_probability"],
)
@pytest.mark.parametrize(
    "value",
    [float("nan"), float("inf"), float("-inf")],
)
def test_forecast_rejects_non_finite_values(field, value):
    data = make_forecast_data()
    data[field] = value

    with pytest.raises(ValidationError):
        WeatherForecast(**data)


@pytest.mark.parametrize("field", WEATHER_FIELDS)
@pytest.mark.parametrize(
    "value",
    [float("nan"), float("inf"), float("-inf")],
)
def test_observation_rejects_non_finite_values(field, value):
    data = {
        "timestamp": datetime.now(timezone.utc),
        field: value,
    }

    with pytest.raises(ValidationError):
        WeatherObservation(**data)


def test_forecast_accepts_negative_temperature_and_missing_probability():
    data = make_forecast_data()
    data["temperature"] = -15.0
    data["precipitation_probability"] = None

    forecast = WeatherForecast(**data)

    assert forecast.temperature == -15.0
    assert forecast.precipitation_probability is None


def test_observation_accepts_missing_values():
    observation = WeatherObservation(
        timestamp=datetime.now(timezone.utc),
    )

    for field in WEATHER_FIELDS:
        assert getattr(observation, field) is None


def test_observation_accepts_negative_temperature():
    observation = WeatherObservation(
        timestamp=datetime.now(timezone.utc),
        temperature=-15.0,
    )

    assert observation.temperature == -15.0
