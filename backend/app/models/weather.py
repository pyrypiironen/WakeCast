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