from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.park import Park
from app.models.park_db import ParkDB
from app.models.weather import WeatherResponse
from app.services.fmi import get_forecast


app = FastAPI(
    title="WakeCast API",
    version="0.1.0",
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

    return get_forecast(
        latitude=park.latitude,
        longitude=park.longitude,
    )