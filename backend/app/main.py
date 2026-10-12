import logging

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.park import Park
from app.models.park_db import ParkDB
from app.models.weather import WeatherForecast, WeatherResponse
from app.security import require_refresh_api_key
from app.services.weather_scheduler import scheduler
from app.services.weather_refresh import refresh_park_forecast
from app.services.weather_storage import get_latest_forecast_snapshot, is_forecast_snapshot_fresh


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()

    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="WakeCast API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/parks", response_model=list[Park])
def get_parks(db: Session = Depends(get_db)):
    return db.query(ParkDB).all()


@app.get("/api/parks/{slug}", response_model=Park)
def get_park(
    slug: str,
    db: Session = Depends(get_db),
):
    park = (
        db.query(ParkDB)
        .filter(ParkDB.slug == slug)
        .first()
    )

    if park is None:
        raise HTTPException(
            status_code=404,
            detail="Park not found",
        )

    return park


@app.get(
    "/api/parks/{slug}/weather",
    response_model=WeatherResponse,
)
def get_park_weather(
    slug: str,
    db: Session = Depends(get_db),
):
    park = (
        db.query(ParkDB)
        .filter(ParkDB.slug == slug)
        .first()
    )

    if park is None:
        raise HTTPException(
            status_code=404,
            detail="Park not found",
        )

    rows = get_latest_forecast_snapshot(
        db=db,
        park_id=park.id,
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Weather forecast not found",
        )
    
    if not is_forecast_snapshot_fresh(rows):
        raise HTTPException(
            status_code=503,
            detail="Weather forecast is stale",
        )

    forecasts = [
        WeatherForecast(
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
        for row in rows
    ]

    return WeatherResponse(
        forecast_location=rows[0].forecast_location,
        forecasts=forecasts,
    )



@app.post(
    "/api/parks/{slug}/weather/refresh",
    dependencies=[Depends(require_refresh_api_key)],
)
def refresh_park_weather(
    slug: str,
    db: Session = Depends(get_db),
):
    park = (
        db.query(ParkDB)
        .filter(ParkDB.slug == slug)
        .first()
    )

    if park is None:
        raise HTTPException(
            status_code=404,
            detail="Park not found",
        )

    try:
        saved_rows = refresh_park_forecast(
            db=db,
            park=park,
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
            "Weather refresh failed for park %s",
            slug,
        )
        raise HTTPException(
            status_code=502,
            detail="Weather forecast provider unavailable",
        )

    return {
        "status": "ok",
        "saved_rows": saved_rows,
    }



