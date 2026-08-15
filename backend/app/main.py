from fastapi import FastAPI, HTTPException

from app.models.park import Park
from app.models.weather import WeatherResponse
from app.parks import parks
from app.services.fmi import get_forecast


app = FastAPI(
    title="WakeCast API",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/parks", response_model=list[Park])
def get_parks():
    return parks


@app.get("/api/parks/{slug}", response_model=Park)
def get_park(slug: str):
    for park in parks:
        if park.slug == slug:
            return park

    raise HTTPException(
        status_code=404,
        detail="Park not found",
    )


@app.get(
    "/api/parks/{slug}/weather",
    response_model=WeatherResponse,
)
def get_park_weather(slug: str):
    for park in parks:
        if park.slug == slug:
            return get_forecast(
                latitude=park.latitude,
                longitude=park.longitude,
            )

    raise HTTPException(
        status_code=404,
        detail="Park not found",
    )