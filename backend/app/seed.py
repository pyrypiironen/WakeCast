
from app.database import SessionLocal
from app.models.park_db import CableDB, ParkDB
from app.models.weather_db import WeatherStationDB


def seed_database():
    db = SessionLocal()

    try:
        existing_station = (
            db.query(WeatherStationDB)
            .filter(
                WeatherStationDB.source == "fmi",
                WeatherStationDB.source_station_id == 100971,
            )
            .first()
        )

        if existing_station is None:
            station = WeatherStationDB(
                name="Helsinki Kaisaniemi",
                region="helsinki",
                source="fmi",
                source_station_id=100971,
                is_active=True,
            )
            db.add(station)
            db.flush()
        else:
            station = existing_station

        existing_park = (
            db.query(ParkDB)
            .filter(ParkDB.slug == "laguuni-keilis")
            .first()
        )

        if existing_park is None:
            park = ParkDB(
                id=1,
                name="Laguuni Keilaniemi",
                slug="laguuni-keilis",
                city="Espoo",
                country="Finland",
                latitude=60.16905,
                longitude=24.833173,
                water_type="sea",
                website_url="https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo",
                timezone="Europe/Helsinki",
                is_active=True,
                observation_station_id=station.id,
                cables=[
                    CableDB(
                        name="Pro Cable",
                        booking_url="https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-pro-cable",
                    ),
                    CableDB(
                        name="Easy Cable",
                        booking_url="https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-easy-cable",
                    ),
                ],
            )
            db.add(park)
        else:
            existing_park.observation_station_id = station.id

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
