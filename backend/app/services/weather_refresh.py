from sqlalchemy.orm import Session

from app.models.park_db import ParkDB
from app.services.weather_forecast import get_forecast
from app.services.weather_storage import save_forecast_snapshot


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
