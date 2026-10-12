from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.weather import WeatherObservationResponse, WeatherResponse
from app.models.weather_db import WeatherForecastDB, WeatherObservationDB


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


def save_observations(
    db: Session,
    weather: WeatherObservationResponse,
    weather_station_id: int,
    resolution_minutes: int | None = None,
    is_aggregated: bool = False,
) -> int:
    fetched_at = datetime.now(timezone.utc)

    rows = [
        {
            "timestamp": observation.timestamp,
            "fetched_at": fetched_at,
            "observation_location": weather.observation_location,
            "weather_station_id": weather_station_id,
            "temperature": observation.temperature,
            "wind_speed": observation.wind_speed,
            "wind_gust": observation.wind_gust,
            "wind_direction": observation.wind_direction,
            "precipitation": observation.precipitation,
            "cloudiness": observation.cloudiness,
            "resolution_minutes": resolution_minutes,
            "is_aggregated": is_aggregated,
            "source": "fmi",
        }
        for observation in weather.observations
    ]

    if not rows:
        return 0

    insert_statement = insert(WeatherObservationDB).values(rows)

    statement = insert_statement.on_conflict_do_update(
        constraint="uq_weather_observations_station_timestamp",
        set_={
            "fetched_at": insert_statement.excluded.fetched_at,
            "observation_location": insert_statement.excluded.observation_location,
            "temperature": insert_statement.excluded.temperature,
            "wind_speed": insert_statement.excluded.wind_speed,
            "wind_gust": insert_statement.excluded.wind_gust,
            "wind_direction": insert_statement.excluded.wind_direction,
            "precipitation": insert_statement.excluded.precipitation,
            "cloudiness": insert_statement.excluded.cloudiness,
            "resolution_minutes": insert_statement.excluded.resolution_minutes,
            "is_aggregated": insert_statement.excluded.is_aggregated,
            "source": insert_statement.excluded.source,
        },
    ).returning(WeatherObservationDB.id)

    result = db.execute(statement)
    saved_ids = result.scalars().all()
    db.commit()
    return len(saved_ids)


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
        db.query(func.min(WeatherForecastDB.fetched_at).label("keep_fetched_at"))
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


def cleanup_old_observations(
    db: Session,
    weather_station_id: int,
    native_history_days: int = 183,
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(
        days=native_history_days,
    )

    deleted_rows = (
        db.query(WeatherObservationDB)
        .filter(
            WeatherObservationDB.weather_station_id == weather_station_id,
            WeatherObservationDB.timestamp < cutoff,
            WeatherObservationDB.resolution_minutes < 60,
            func.extract(
                "minute",
                WeatherObservationDB.timestamp,
            )
            != 0,
        )
        .delete(
            synchronize_session=False,
        )
    )

    (
        db.query(WeatherObservationDB)
        .filter(
            WeatherObservationDB.weather_station_id == weather_station_id,
            WeatherObservationDB.timestamp < cutoff,
            WeatherObservationDB.resolution_minutes < 60,
        )
        .update(
            {
                WeatherObservationDB.resolution_minutes: 60,
            },
            synchronize_session=False,
        )
    )

    db.commit()

    return deleted_rows
