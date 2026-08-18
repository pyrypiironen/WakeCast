from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.weather import WeatherResponse
from app.models.weather_db import WeatherForecastDB


def save_forecast_snapshot(
    db: Session,
    park_id: int,
    weather: WeatherResponse,
) -> int:
    fetched_at = datetime.now(timezone.utc)

    rows = [
        WeatherForecastDB(
            park_id=park_id,
            timestamp=forecast.timestamp,
            fetched_at=fetched_at,
            temperature=forecast.temperature,
            wind_speed=forecast.wind_speed,
            wind_gust=forecast.wind_gust,
            wind_direction=forecast.wind_direction,
            precipitation=forecast.precipitation,
            precipitation_probability=forecast.precipitation_probability,
            cloudiness=forecast.cloudiness,
            source=forecast.source,
        )
        for forecast in weather.forecasts
    ]

    db.add_all(rows)
    db.commit()

    return len(rows)