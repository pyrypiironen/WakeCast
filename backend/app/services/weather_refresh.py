from sqlalchemy.orm import Session

from app.models.park_db import ParkDB
from app.models.weather_db import WeatherStationDB
from app.services.fmi_observations import get_observations
from app.services.weather_forecast import get_forecast
from app.services.weather_storage import save_forecast_snapshot, save_observations


def refresh_park_forecast(
    db: Session,
    park: ParkDB,
) -> int:
    weather = get_forecast(
        latitude=park.latitude,
        longitude=park.longitude,
    )

    return save_forecast_snapshot(
        db=db,
        park_id=park.id,
        weather=weather,
    )


def refresh_observations(
    db: Session,
    station: WeatherStationDB,
) -> int:
    weather = get_observations(
        station_id=station.source_station_id,
    )

    return save_observations(
        db=db,
        weather=weather,
        weather_station_id=station.id,
        resolution_minutes=10,
        is_aggregated=False,
    )
