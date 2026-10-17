import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_park_or_404
from app.models.park import Park
from app.models.park_db import ParkDB
from app.models.water_temperature import ParkWaterTemperatureResponse
from app.models.weather import (
    ParkWeatherResponse,
    WeatherForecast,
    WeatherResponse,
)
from app.routes.history import router as history_router
from app.security import require_refresh_api_key
from app.services.water_temperature_storage import (
    get_latest_water_temperature_observation,
)
from app.services.weather_errors import WeatherProviderError
from app.services.weather_forecast import merge_forecasts
from app.services.weather_job_monitor import job_monitor
from app.services.weather_refresh import refresh_park_forecast
from app.services.weather_refresh_lock import ForecastRefreshInProgress
from app.services.weather_scheduler import scheduler
from app.services.weather_storage import (
    get_latest_forecast_snapshot,
    get_recent_ecmwf_fallback,
    is_forecast_snapshot_fresh,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start(paused=True)

    try:
        now = datetime.now(UTC)

        for job_id in (
            "refresh_weather_forecasts",
            "refresh_weather_observations",
            "refresh_water_temperatures",
        ):
            scheduler.modify_job(
                job_id,
                next_run_time=now,
                misfire_grace_time=60,
                coalesce=True,
                max_instances=1,
            )

        scheduler.resume()

        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="WakeCast API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(history_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get(
    "/api/admin/weather-jobs",
    dependencies=[Depends(require_refresh_api_key)],
)
def get_weather_job_status():
    return {
        "scope": "process",
        "scheduler_running": scheduler.running,
        "jobs": job_monitor.snapshot(),
    }


@app.get("/api/parks", response_model=list[Park])
def get_parks(db: Session = Depends(get_db)):
    return db.query(ParkDB).all()


@app.get("/api/parks/{slug}", response_model=Park)
def get_park(
    park: ParkDB = Depends(get_park_or_404),
):
    return park


@app.get(
    "/api/parks/{slug}/weather",
    response_model=ParkWeatherResponse,
)
def get_park_weather(
    db: Session = Depends(get_db),
    park: ParkDB = Depends(get_park_or_404),
):
    rows = get_latest_forecast_snapshot(
        db=db,
        park_id=park.id,
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Weather forecast not found",
        )

    now = datetime.now(UTC)

    if not is_forecast_snapshot_fresh(rows, now=now):
        raise HTTPException(
            status_code=503,
            detail="Weather forecast is stale",
        )

    # Include the hour currently in progress.
    current_hour_start = now.replace(minute=0, second=0, microsecond=0)

    upcoming_rows = [row for row in rows if row.timestamp >= current_hour_start]

    # Use historical ECMWF data only when the latest snapshot has no
    # upcoming ECMWF points. Keep the original database rows unchanged.
    if not any(row.source == "ecmwf" for row in upcoming_rows):
        fallback_rows = get_recent_ecmwf_fallback(
            db=db,
            park_id=park.id,
            now=now,
        )
        upcoming_rows.extend(fallback_rows)

    if not upcoming_rows:
        raise HTTPException(
            status_code=503,
            detail="Weather forecast has no upcoming data",
        )

    provider_responses = {
        source: WeatherResponse(
            forecast_location="Unknown",
            forecasts=[],
        )
        for source in ("fmi_edited", "ecmwf")
    }

    for row in upcoming_rows:
        forecast = WeatherForecast(
            timestamp=row.timestamp,
            temperature=row.temperature,
            wind_speed=row.wind_speed,
            wind_gust=row.wind_gust,
            wind_direction=row.wind_direction,
            precipitation=row.precipitation,
            precipitation_probability=row.precipitation_probability,
            cloudiness=row.cloudiness,
            source=row.source,
        )

        provider_key = (
            "fmi_edited" if forecast.source == "harmonie" else forecast.source
        )
        provider_response = provider_responses[provider_key]
        provider_response.forecast_location = row.forecast_location
        provider_response.forecasts.append(forecast)

    merged = merge_forecasts(
        provider_responses["fmi_edited"],
        provider_responses["ecmwf"],
    )

    return ParkWeatherResponse(
        forecast_location=merged.forecast_location,
        forecasts=merged.forecasts,
        fetched_at=rows[0].fetched_at,
        coverage_start=merged.forecasts[0].timestamp,
        coverage_end=merged.forecasts[-1].timestamp,
    )


@app.post(
    "/api/parks/{slug}/weather/refresh",
    dependencies=[Depends(require_refresh_api_key)],
)
def refresh_park_weather(
    slug: str,
    db: Session = Depends(get_db),
    park: ParkDB = Depends(get_park_or_404),
):
    try:
        saved_rows = refresh_park_forecast(
            db=db,
            park=park,
        )
    except ForecastRefreshInProgress:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Weather forecast refresh already in progress",
        )
    except WeatherProviderError:
        db.rollback()
        logger.exception(
            "Weather provider error refreshing weather for park %s",
            slug,
        )
        raise HTTPException(
            status_code=502,
            detail="Weather forecast provider unavailable",
        )
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error refreshing weather for park %s",
            slug,
        )
        raise HTTPException(
            status_code=500,
            detail="Weather refresh failed",
        )
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error refreshing weather for park %s",
            slug,
        )
        raise HTTPException(
            status_code=500,
            detail="Weather refresh failed",
        )

    return {
        "status": "ok",
        "saved_rows": saved_rows,
    }


@app.get(
    "/api/parks/{slug}/water-temperature",
    response_model=ParkWaterTemperatureResponse,
)
def get_park_water_temperature(
    db: Session = Depends(get_db),
    park: ParkDB = Depends(get_park_or_404),
):
    station = park.water_temperature_station

    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Water temperature station not configured",
        )

    if not station.is_active:
        raise HTTPException(
            status_code=503,
            detail="Water temperature station is inactive",
        )

    latest = get_latest_water_temperature_observation(
        db=db,
        station_id=station.id,
    )

    if latest is None:
        raise HTTPException(
            status_code=404,
            detail="Water temperature observation not found",
        )

    age = datetime.now(UTC) - latest.timestamp

    return ParkWaterTemperatureResponse(
        source=station.source,
        source_station_id=station.source_station_id,
        observation_location=station.name,
        latitude=station.latitude,
        longitude=station.longitude,
        timestamp=latest.timestamp,
        fetched_at=latest.fetched_at,
        water_temperature=latest.water_temperature,
        is_stale=age > timedelta(hours=2),
    )
