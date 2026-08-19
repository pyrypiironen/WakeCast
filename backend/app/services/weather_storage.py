from datetime import datetime, timezone

from sqlalchemy import func
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
            forecast_location=weather.forecast_location,
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


def get_latest_forecast_snapshot(
    db: Session,
    park_id: int,
) -> list[WeatherForecastDB]:
    latest_fetched_at = (
        db.query(func.max(WeatherForecastDB.fetched_at))
        .filter(WeatherForecastDB.park_id == park_id)
        .scalar()
    )

    if latest_fetched_at is None:
        return []

    return (
        db.query(WeatherForecastDB)
        .filter(
            WeatherForecastDB.park_id == park_id,
            WeatherForecastDB.fetched_at == latest_fetched_at,
        )
        .order_by(WeatherForecastDB.timestamp)
        .all()
    )


