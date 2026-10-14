import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.models.park_db import ParkDB
from app.models.water_temperature_db import WaterTemperatureStationDB
from app.models.weather_db import WeatherStationDB
from app.services.water_temperature_refresh import refresh_water_temperature
from app.services.weather_job_monitor import job_monitor
from app.services.weather_refresh import (
    refresh_observations,
    refresh_park_forecast,
)
from app.services.weather_refresh_lock import ForecastRefreshInProgress
from app.services.weather_storage import (
    cleanup_old_forecast_snapshots,
    cleanup_old_observations,
)

logger = logging.getLogger(__name__)


@job_monitor.track("refresh_weather_forecasts")
def refresh_all_active_parks() -> dict[str, int]:
    db = SessionLocal()
    result = {
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }

    try:
        parks = db.query(ParkDB).filter(ParkDB.is_active.is_(True)).all()
        park_items = [(park, park.id, park.slug) for park in parks]

        for park, park_id, park_slug in park_items:
            try:
                refresh_park_forecast(
                    db=db,
                    park=park,
                )

                cleanup_old_forecast_snapshots(
                    db=db,
                    park_id=park_id,
                )

                result["succeeded"] += 1
            except ForecastRefreshInProgress:
                db.rollback()
                result["skipped"] += 1
                logger.info("Skipping forecast refresh: another refresh is in progress")
            except Exception:
                db.rollback()
                result["failed"] += 1
                logger.exception(
                    "Weather refresh failed for park %s",
                    park_slug,
                )
    finally:
        db.close()

    return result


@job_monitor.track("refresh_weather_observations")
def refresh_all_active_weather_stations() -> dict[str, int]:
    db = SessionLocal()
    result = {
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }

    try:
        stations = (
            db.query(WeatherStationDB)
            .filter(WeatherStationDB.is_active.is_(True))
            .all()
        )
        station_items = [(station, station.id) for station in stations]

        for station, station_id in station_items:
            try:
                refresh_observations(
                    db=db,
                    station=station,
                )

                result["succeeded"] += 1
            except Exception:
                db.rollback()
                result["failed"] += 1
                logger.exception(
                    "Weather observation refresh failed for station %s",
                    station_id,
                )
    finally:
        db.close()

    return result


@job_monitor.track("cleanup_weather_observations")
def cleanup_all_active_weather_stations() -> dict[str, int]:
    db = SessionLocal()
    result = {
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }

    try:
        stations = (
            db.query(WeatherStationDB)
            .filter(WeatherStationDB.is_active.is_(True))
            .all()
        )
        station_items = [(station, station.id) for station in stations]

        for station, station_id in station_items:
            try:
                cleanup_old_observations(
                    db=db,
                    weather_station_id=station_id,
                )

                result["succeeded"] += 1
            except Exception:
                db.rollback()
                result["failed"] += 1
                logger.exception(
                    "Weather observation cleanup failed for station %s",
                    station_id,
                )
    finally:
        db.close()

    return result


@job_monitor.track("refresh_water_temperatures")
def refresh_all_active_water_temperature_stations() -> dict[str, int]:
    db = SessionLocal()
    result = {
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }

    try:
        stations = (
            db.query(WaterTemperatureStationDB)
            .filter(WaterTemperatureStationDB.is_active.is_(True))
            .all()
        )
        station_items = [(station, station.id) for station in stations]

        for station, station_id in station_items:
            try:
                refresh_water_temperature(
                    db=db,
                    station=station,
                )

                result["succeeded"] += 1
            except Exception:
                db.rollback()
                result["failed"] += 1
                logger.exception(
                    "Water temperature refresh failed for station %s",
                    station_id,
                )
    finally:
        db.close()

    return result


scheduler = BackgroundScheduler(
    timezone="UTC",
)

scheduler.add_job(
    refresh_all_active_parks,
    trigger="interval",
    minutes=15,
    id="refresh_weather_forecasts",
    replace_existing=True,
)

scheduler.add_job(
    refresh_all_active_weather_stations,
    trigger="interval",
    minutes=10,
    id="refresh_weather_observations",
    replace_existing=True,
)

scheduler.add_job(
    cleanup_all_active_weather_stations,
    trigger="cron",
    hour=3,
    minute=0,
    id="cleanup_weather_observations",
    replace_existing=True,
)

scheduler.add_job(
    refresh_all_active_water_temperature_stations,
    trigger="interval",
    minutes=30,
    id="refresh_water_temperatures",
    replace_existing=True,
)
