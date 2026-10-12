from sqlalchemy.orm import Session

from app.models.water_temperature_db import WaterTemperatureStationDB
from app.services.uiras import get_water_temperature
from app.services.water_temperature_storage import (
    save_water_temperature_observations,
)


def refresh_water_temperature(
    db: Session,
    station: WaterTemperatureStationDB,
) -> int:
    if not station.is_active:
        return 0

    if station.source != "uiras":
        raise ValueError(f"Unsupported water temperature source: {station.source}")

    weather = get_water_temperature(
        station_id=station.source_station_id,
    )

    return save_water_temperature_observations(
        db=db,
        station=station,
        weather=weather,
    )
