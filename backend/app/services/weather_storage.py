from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.weather import WeatherObservationResponse, WeatherResponse
from app.models.weather_db import WeatherForecastDB, WeatherObservationDB


def save_forecast_snapshot(
    db: Session,
    park_id: int,
    provider_forecasts: tuple[WeatherResponse, ...],
) -> int:
    fetched_at = datetime.now(UTC)

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
        for weather in provider_forecasts
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
    *,
    commit: bool = True,
) -> int:
    fetched_at = datetime.now(UTC)

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
            "temperature": func.coalesce(
                insert_statement.excluded.temperature,
                WeatherObservationDB.temperature,
            ),
            "wind_speed": func.coalesce(
                insert_statement.excluded.wind_speed,
                WeatherObservationDB.wind_speed,
            ),
            "wind_gust": func.coalesce(
                insert_statement.excluded.wind_gust,
                WeatherObservationDB.wind_gust,
            ),
            "wind_direction": func.coalesce(
                insert_statement.excluded.wind_direction,
                WeatherObservationDB.wind_direction,
            ),
            "precipitation": func.coalesce(
                insert_statement.excluded.precipitation,
                WeatherObservationDB.precipitation,
            ),
            "cloudiness": func.coalesce(
                insert_statement.excluded.cloudiness,
                WeatherObservationDB.cloudiness,
            ),
            "resolution_minutes": insert_statement.excluded.resolution_minutes,
            "is_aggregated": insert_statement.excluded.is_aggregated,
            "source": insert_statement.excluded.source,
        },
    ).returning(WeatherObservationDB.id)

    result = db.execute(statement)
    saved_ids = result.scalars().all()

    if commit:
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


def get_recent_ecmwf_fallback(
    db: Session,
    park_id: int,
    *,
    now: datetime,
) -> list[WeatherForecastDB]:
    """Return ECMWF points beyond 48h from a snapshot at most 2h old."""

    latest_ecmwf_fetched_at = (
        db.query(func.max(WeatherForecastDB.fetched_at))
        .filter(
            WeatherForecastDB.park_id == park_id,
            WeatherForecastDB.source == "ecmwf",
            WeatherForecastDB.fetched_at >= now - timedelta(hours=2),
            WeatherForecastDB.fetched_at <= now,
        )
        .scalar()
    )

    if latest_ecmwf_fetched_at is None:
        return []

    return (
        db.query(WeatherForecastDB)
        .filter(
            WeatherForecastDB.park_id == park_id,
            WeatherForecastDB.source == "ecmwf",
            WeatherForecastDB.fetched_at == latest_ecmwf_fetched_at,
            WeatherForecastDB.timestamp > now + timedelta(hours=48),
        )
        .order_by(WeatherForecastDB.timestamp)
        .all()
    )


def is_forecast_snapshot_fresh(
    rows: list[WeatherForecastDB],
    max_age_minutes: int = 30,
    *,
    now: datetime | None = None,
) -> bool:
    if not rows:
        return False

    if now is None:
        now = datetime.now(UTC)

    age = now - rows[0].fetched_at

    return timedelta(0) <= age <= timedelta(minutes=max_age_minutes)


def cleanup_old_forecast_snapshots(
    db: Session,
    park_id: int,
    full_history_days: int = 7,
) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=full_history_days)

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
    cutoff = datetime.now(UTC) - timedelta(
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
