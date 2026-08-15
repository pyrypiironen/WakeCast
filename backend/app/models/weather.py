from datetime import datetime

from pydantic import BaseModel


class WeatherForecast(BaseModel):
    timestamp: datetime

    temperature: float
    wind_speed: float
    wind_gust: float
    wind_direction: float

    precipitation: float
    precipitation_probability: float
    cloudiness: float