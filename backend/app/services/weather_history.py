from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)
from app.models.weather_db import WeatherStationDB
from app.services.fmi_observations import (
    get_observation_resolution_minutes,
    get_observations,
)
from app.services.weather_storage import save_observations


RECENT_HISTORY_DAYS = 183


def build_response(
    weather: WeatherObservationResponse,
    observations: list[WeatherObservation],
) -> WeatherObservationResponse:
    return WeatherObservationResponse(
        observation_location=weather.observation_location,
        observation_station_id=weather.observation_station_id,
        observations=observations,
    )


def reduce_to_hourly(
    weather: WeatherObservationResponse,
) -> WeatherObservationResponse:
    hourly_observations = [
        observation
        for observation in weather.observations
        if observation.timestamp.minute == 0
    ]

    return build_response(
        weather=weather,
        observations=hourly_observations,
    )


def backfill_observations(
    db: Session,
    station: WeatherStationDB,
    start_time: datetime,
    end_time: datetime,
) -> int:
    if station.source != "fmi":
        raise ValueError(f"Unsupported weather station source: {station.source}")

    weather = get_observations(
        station_id=station.source_station_id,
        start_time=start_time,
        end_time=end_time,
    )

    resolution_minutes = get_observation_resolution_minutes(weather)

    if resolution_minutes is None:
        return 0

    if resolution_minutes >= 60:
        return save_observations(
            db=db,
            weather=weather,
            weather_station_id=station.id,
            resolution_minutes=resolution_minutes,
            is_aggregated=False,
        )

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=RECENT_HISTORY_DAYS)

    old_observations = [
        observation
        for observation in weather.observations
        if observation.timestamp < recent_cutoff
    ]

    recent_observations = [
        observation
        for observation in weather.observations
        if observation.timestamp >= recent_cutoff
    ]

    inserted = 0

    if old_observations:
        old_weather = build_response(
            weather=weather,
            observations=old_observations,
        )

        old_weather = reduce_to_hourly(old_weather)

        inserted += save_observations(
            db=db,
            weather=old_weather,
            weather_station_id=station.id,
            resolution_minutes=60,
            is_aggregated=False,
        )

    if recent_observations:
        recent_weather = build_response(
            weather=weather,
            observations=recent_observations,
        )

        inserted += save_observations(
            db=db,
            weather=recent_weather,
            weather_station_id=station.id,
            resolution_minutes=resolution_minutes,
            is_aggregated=False,
        )

    return inserted
