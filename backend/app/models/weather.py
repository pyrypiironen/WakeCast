from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class WeatherForecast(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    timestamp: datetime

    temperature: float
    wind_speed: float
    wind_gust: float
    wind_direction: float

    precipitation: float
    precipitation_probability: float | None = None
    cloudiness: float

    source: Literal["fmi_edited", "ecmwf", "harmonie"]


class WeatherResponse(BaseModel):
    forecast_location: str
    forecasts: list[WeatherForecast]


class ParkWeatherResponse(WeatherResponse):
    fetched_at: datetime
    coverage_start: datetime
    coverage_end: datetime


class WeatherObservation(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    timestamp: datetime

    temperature: float | None = None
    wind_speed: float | None = None
    wind_gust: float | None = None
    wind_direction: float | None = None

    precipitation: float | None = None
    cloudiness: float | None = None


class WeatherObservationResponse(BaseModel):
    observation_location: str
    observation_station_id: int
    observations: list[WeatherObservation]
