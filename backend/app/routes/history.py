from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_park_or_404
from app.models.history import (
    ParkWaterTemperatureHistoryResponse,
    ParkWeatherObservationHistoryResponse,
    WaterTemperatureHistoryPoint,
    WeatherObservationHistoryPoint,
)
from app.models.park_db import ParkDB
from app.models.water_temperature_db import WaterTemperatureObservationDB
from app.models.weather_db import WeatherObservationDB

router = APIRouter()

MAX_HISTORY_RANGE = timedelta(days=31)


def validated_range(
    start_time: AwareDatetime,
    end_time: AwareDatetime,
) -> tuple[datetime, datetime]:
    """Validate an offset-aware, bounded half-open [start, end) interval."""
    start = start_time.astimezone(UTC)
    end = end_time.astimezone(UTC)
    if end <= start:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")
    if end - start > MAX_HISTORY_RANGE:
        raise HTTPException(
            status_code=422, detail="History range must not exceed 31 days"
        )
    return start, end


@router.get(
    "/api/parks/{slug}/weather/observations",
    response_model=ParkWeatherObservationHistoryResponse,
)
def get_park_weather_observation_history(
    start_time: AwareDatetime,
    end_time: AwareDatetime,
    db: Annotated[Session, Depends(get_db)],
    park: Annotated[ParkDB, Depends(get_park_or_404)],
):
    start, end = validated_range(start_time, end_time)

    station = park.observation_station
    if station is None:
        raise HTTPException(
            status_code=404,
            detail="Weather observation station not configured",
        )
    if not station.is_active:
        raise HTTPException(
            status_code=503,
            detail="Weather observation station is inactive",
        )

    # History is observations only, even if the requested day extends into
    # the future. Do not present future timestamps as measured values.
    end = min(end, datetime.now(UTC))
    rows = (
        db.query(WeatherObservationDB)
        .filter(
            WeatherObservationDB.weather_station_id == station.id,
            WeatherObservationDB.timestamp >= start,
            WeatherObservationDB.timestamp < end,
        )
        .order_by(WeatherObservationDB.timestamp)
        .all()
        if end > start
        else []
    )

    return ParkWeatherObservationHistoryResponse(
        station_name=station.name,
        source=station.source,
        source_station_id=station.source_station_id,
        timezone=park.timezone,
        observations=[
            WeatherObservationHistoryPoint(
                timestamp=row.timestamp,
                fetched_at=row.fetched_at,
                temperature=row.temperature,
                wind_speed=row.wind_speed,
                wind_gust=row.wind_gust,
                wind_direction=row.wind_direction,
                precipitation=row.precipitation,
                cloudiness=row.cloudiness,
                source=row.source,
                observation_location=row.observation_location,
                resolution_minutes=row.resolution_minutes,
                is_aggregated=row.is_aggregated,
            )
            for row in rows
        ],
    )


@router.get(
    "/api/parks/{slug}/water-temperature/history",
    response_model=ParkWaterTemperatureHistoryResponse,
)
def get_park_water_temperature_history(
    start_time: AwareDatetime,
    end_time: AwareDatetime,
    db: Annotated[Session, Depends(get_db)],
    park: Annotated[ParkDB, Depends(get_park_or_404)],
):
    start, end = validated_range(start_time, end_time)

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

    now = datetime.now(UTC)
    end = min(end, now)
    preceding_row = (
        db.query(WaterTemperatureObservationDB)
        .filter(
            WaterTemperatureObservationDB.water_temperature_station_id == station.id,
            WaterTemperatureObservationDB.timestamp < start,
        )
        .order_by(WaterTemperatureObservationDB.timestamp.desc())
        .first()
        if start <= now
        else None
    )
    rows = (
        db.query(WaterTemperatureObservationDB)
        .filter(
            WaterTemperatureObservationDB.water_temperature_station_id == station.id,
            WaterTemperatureObservationDB.timestamp >= start,
            WaterTemperatureObservationDB.timestamp < end,
        )
        .order_by(WaterTemperatureObservationDB.timestamp)
        .all()
        if end > start
        else []
    )

    return ParkWaterTemperatureHistoryResponse(
        observation_location=station.name,
        source=station.source,
        source_station_id=station.source_station_id,
        latitude=station.latitude,
        longitude=station.longitude,
        timezone=park.timezone,
        observations=[
            WaterTemperatureHistoryPoint(
                timestamp=row.timestamp,
                fetched_at=row.fetched_at,
                water_temperature=row.water_temperature,
            )
            for row in rows
        ],
        preceding_observation=(
            WaterTemperatureHistoryPoint(
                timestamp=preceding_row.timestamp,
                fetched_at=preceding_row.fetched_at,
                water_temperature=preceding_row.water_temperature,
            )
            if preceding_row is not None
            else None
        ),
    )
