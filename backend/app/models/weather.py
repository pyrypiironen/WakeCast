from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class WeatherForecast(BaseModel):
    timestamp: datetime

    temperature: float
    wind_speed: float
    wind_gust: float
    wind_direction: float

    precipitation: float
    precipitation_probability: float | None = None
    cloudiness: float

    source: Literal["harmonie", "ecmwf"]


class WeatherResponse(BaseModel):
    forecast_location: str
    forecasts: list[WeatherForecast]


class WeatherObservation(BaseModel):
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