from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.models.park_db import ParkDB
from app.services.weather_refresh import refresh_park_forecast
from app.services.weather_storage import cleanup_old_forecast_snapshots


def refresh_all_active_parks() -> None:
    db = SessionLocal()

    try:
        parks = (
            db.query(ParkDB)
            .filter(ParkDB.is_active.is_(True))
            .all()
        )

        for park in parks:
            refresh_park_forecast(
                db=db,
                park=park,
            )

            cleanup_old_forecast_snapshots(
                db=db,
                park_id=park.id,
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
