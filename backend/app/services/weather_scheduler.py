import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.models.park_db import ParkDB
from app.models.water_temperature_db import WaterTemperatureStationDB
from app.models.weather_db import WeatherStationDB
from app.services.water_temperature_refresh import refresh_water_temperature
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


def refresh_all_active_parks() -> None:
    db = SessionLocal()

    try:
        parks = db.query(ParkDB).filter(ParkDB.is_active.is_(True)).all()

        for park in parks:
            try:
                refresh_park_forecast(
                    db=db,
                    park=park,
                )

                cleanup_old_forecast_snapshots(
                    db=db,
                    park_id=park.id,
                )
            except ForecastRefreshInProgress:
                db.rollback()
                logger.info("Skipping forecast refresh: another refresh is in progress")
            except Exception:
                db.rollback()
                logger.exception(
                    "Weather refresh failed for park %s",
                    park.slug,
                )
    finally:
        db.close()


def refresh_all_active_weather_stations() -> None:
    db = SessionLocal()

    try:
        stations = (
            db.query(WeatherStationDB)
            .filter(WeatherStationDB.is_active.is_(True))
            .all()
        )

        for station in stations:
            try:
                refresh_observations(
                    db=db,
                    station=station,
                )
            except Exception:
                db.rollback()
                logger.exception(
                    "Weather observation refresh failed for station %s",
                    station.id,
                )
    finally:
        db.close()


def cleanup_all_active_weather_stations() -> None:
    db = SessionLocal()

    try:
        stations = (
            db.query(WeatherStationDB)
            .filter(WeatherStationDB.is_active.is_(True))
            .all()
        )

        for station in stations:
            try:
                cleanup_old_observations(
                    db=db,
                    weather_station_id=station.id,
                )
            except Exception:
                db.rollback()
                logger.exception(
                    "Weather observation cleanup failed for station %s",
                    station.id,
                )
    finally:
        db.close()


def refresh_all_active_water_temperature_stations() -> None:
    db = SessionLocal()

    try:
        stations = (
            db.query(WaterTemperatureStationDB)
            .filter(WaterTemperatureStationDB.is_active.is_(True))
            .all()
        )

        for station in stations:
            try:
                refresh_water_temperature(
                    db=db,
                    station=station,
                )
            except Exception:
                db.rollback()
                logger.exception(
                    "Water temperature refresh failed for station %s",
                    station.id,
                )
    finally:
        db.close()


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
