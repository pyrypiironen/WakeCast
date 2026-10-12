from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.water_temperature import WaterTemperatureResponse
from app.models.water_temperature_db import (
    WaterTemperatureObservationDB,
    WaterTemperatureStationDB,
)


def save_water_temperature_observations(
    db: Session,
    station: WaterTemperatureStationDB,
    weather: WaterTemperatureResponse,
) -> int:
    if (
        station.source != weather.source
        or station.source_station_id != weather.source_station_id
    ):
        raise ValueError(
            "Water temperature response does not match the station"
        )

    fetched_at = datetime.now(timezone.utc)

    rows = [
        {
            "water_temperature_station_id": station.id,
            "timestamp": observation.timestamp,
            "fetched_at": fetched_at,
            "water_temperature": observation.water_temperature,
        }
        for observation in weather.observations
    ]

    if not rows:
        return 0

    insert_statement = insert(
        WaterTemperatureObservationDB
    ).values(rows)

    statement = (
        insert_statement
        .on_conflict_do_update(
            constraint="uq_water_temperature_observations_station_timestamp",
            set_={
                "fetched_at": insert_statement.excluded.fetched_at,
                "water_temperature": (
                    insert_statement.excluded.water_temperature
                ),
            },
        )
        .returning(WaterTemperatureObservationDB.id)
    )

    result = db.execute(statement)
    saved_ids = result.scalars().all()
    db.commit()

    return len(saved_ids)


def get_latest_water_temperature_observation(
    db: Session,
    station_id: int,
) -> WaterTemperatureObservationDB | None:
    return (
        db.query(WaterTemperatureObservationDB)
        .filter(
            WaterTemperatureObservationDB.water_temperature_station_id
            == station_id
        )
        .order_by(WaterTemperatureObservationDB.timestamp.desc())
        .first()
    )

