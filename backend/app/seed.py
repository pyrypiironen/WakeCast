from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.park_db import CableDB, ParkDB
from app.models.water_temperature_db import WaterTemperatureStationDB
from app.models.weather_db import WeatherStationDB
from app.seed_data import PARKS, WATER_TEMPERATURE_STATIONS, WEATHER_STATIONS


def seed_records(db: Session) -> None:
    weather_stations: dict[str, WeatherStationDB] = {}

    for key, values in WEATHER_STATIONS.items():
        station = (
            db.query(WeatherStationDB)
            .filter(
                WeatherStationDB.source == values["source"],
                WeatherStationDB.source_station_id == values["source_station_id"],
            )
            .one_or_none()
        )

        if station is None:
            station = WeatherStationDB(**values)
            db.add(station)
        else:
            for field, value in values.items():
                setattr(station, field, value)

        weather_stations[key] = station

    water_stations: dict[str, WaterTemperatureStationDB] = {}

    for key, values in WATER_TEMPERATURE_STATIONS.items():
        station = (
            db.query(WaterTemperatureStationDB)
            .filter(
                WaterTemperatureStationDB.source == values["source"],
                WaterTemperatureStationDB.source_station_id
                == values["source_station_id"],
            )
            .one_or_none()
        )

        if station is None:
            station = WaterTemperatureStationDB(**values)
            db.add(station)
        else:
            for field, value in values.items():
                setattr(station, field, value)

        water_stations[key] = station

    db.flush()

    for values in PARKS:
        park_values = values.copy()
        cable_values = park_values.pop("cables", [])
        weather_key = park_values.pop("observation_station_key", None)
        water_key = park_values.pop("water_temperature_station_key", None)

        observation_station = (
            weather_stations[weather_key] if weather_key is not None else None
        )
        water_station = water_stations[water_key] if water_key is not None else None

        park = db.query(ParkDB).filter(ParkDB.slug == park_values["slug"]).one_or_none()

        if park is None:
            park = ParkDB(**park_values)
            db.add(park)
        else:
            for field, value in park_values.items():
                setattr(park, field, value)

        park.observation_station = observation_station
        park.water_temperature_station = water_station

        existing_cables = {cable.name: cable for cable in park.cables}

        for cable_data in cable_values:
            cable_name = cable_data["name"]
            cable = existing_cables.get(cable_name)

            if cable is None:
                cable = CableDB(**cable_data)
                park.cables.append(cable)
                existing_cables[cable_name] = cable
            else:
                for field, value in cable_data.items():
                    setattr(cable, field, value)

        db.flush()


def seed_database() -> None:
    db = SessionLocal()

    try:
        seed_records(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
