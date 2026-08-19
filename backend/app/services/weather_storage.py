from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
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


def is_forecast_snapshot_fresh(
    rows: list[WeatherForecastDB],
    max_age_minutes: int = 30,
) -> bool:
    if not rows:
        return False

    fetched_at = rows[0].fetched_at
    now = datetime.now(timezone.utc)

    return now - fetched_at <= timedelta(minutes=max_age_minutes)


def cleanup_old_forecast_snapshots(
    db: Session,
    park_id: int,
    full_history_days: int = 7,
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=full_history_days)

    hourly_snapshots = (
        db.query(
            func.min(WeatherForecastDB.fetched_at).label("keep_fetched_at")
        )
        .filter(
            WeatherForecastDB.park_id == park_id,
            WeatherForecastDB.fetched_at < cutoff,
        )
        .group_by(
            func.date_trunc(
                "hour",
                WeatherForecastDB.fetched_at,
            )
        )
        .subquery()
    )

    deleted_rows = (
        db.query(WeatherForecastDB)
        .filter(
            WeatherForecastDB.park_id == park_id,
            WeatherForecastDB.fetched_at < cutoff,
            ~WeatherForecastDB.fetched_at.in_(
                select(hourly_snapshots.c.keep_fetched_at)
            ),
        )
        .delete(
            synchronize_session=False,
        )
    )

    db.commit()

    return deleted_rows