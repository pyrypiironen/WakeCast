import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.park_db import ParkDB
from app.models.weather import WeatherObservationResponse
from app.models.weather_db import WeatherObservationDB, WeatherStationDB
from app.services.fmi_observations import get_observations
from app.services.weather_forecast import get_provider_forecasts
from app.services.weather_refresh_lock import acquire_forecast_refresh_lock
from app.services.weather_storage import save_forecast_snapshot, save_observations

logger = logging.getLogger(__name__)

OBSERVATION_INITIAL_LOOKBACK = timedelta(hours=6)
OBSERVATION_REFRESH_OVERLAP = timedelta(hours=1)
OBSERVATION_MAX_CATCHUP = timedelta(days=7)
OBSERVATION_REQUEST_CHUNK = timedelta(days=1)


def refresh_park_forecast(
    db: Session,
    park: ParkDB,
) -> int:
    acquire_forecast_refresh_lock(
        db=db,
        park_id=park.id,
    )

    provider_forecasts = get_provider_forecasts(
        latitude=park.latitude,
        longitude=park.longitude,
    )

    return save_forecast_snapshot(
        db=db,
        park_id=park.id,
        provider_forecasts=provider_forecasts,
    )


def refresh_observations(
    db: Session,
    station: WeatherStationDB,
    *,
    now: datetime | None = None,
) -> int:
    if now is None:
        now = datetime.now(timezone.utc)

    station_id = station.id
    source_station_id = station.source_station_id

    latest_timestamp = (
        db.query(func.max(WeatherObservationDB.timestamp))
        .filter(
            WeatherObservationDB.weather_station_id == station_id,
            WeatherObservationDB.timestamp <= now,
        )
        .scalar()
    )

    if latest_timestamp is None:
        start_time = now - OBSERVATION_INITIAL_LOOKBACK
    else:
        start_time = latest_timestamp - OBSERVATION_REFRESH_OVERLAP

    earliest_allowed = now - OBSERVATION_MAX_CATCHUP

    if start_time < earliest_allowed:
        logger.warning(
            "Observation catch-up limited to seven days for station %s; "
            "older gaps require backfill",
            station_id,
        )
        start_time = earliest_allowed

    saved = 0
    current = start_time

    while current < now:
        chunk_end = min(current + OBSERVATION_REQUEST_CHUNK, now)

        weather = get_observations(
            station_id=source_station_id,
            start_time=current,
            end_time=chunk_end,
        )

        bounded_weather = WeatherObservationResponse(
            observation_location=weather.observation_location,
            observation_station_id=weather.observation_station_id,
            observations=[
                observation
                for observation in weather.observations
                if current <= observation.timestamp <= chunk_end
            ],
        )

        saved += save_observations(
            db=db,
            weather=bounded_weather,
            weather_station_id=station_id,
            resolution_minutes=10,
            is_aggregated=False,
            commit=False,
        )

        current = chunk_end

    db.commit()
    return saved
