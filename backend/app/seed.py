from app.database import SessionLocal
from app.models.park_db import CableDB, ParkDB


def seed_database():
    db = SessionLocal()

    try:
        existing_park = (
            db.query(ParkDB)
            .filter(ParkDB.slug == "laguuni-keilis")
            .first()
        )

        if existing_park is not None:
            return

        park = ParkDB(
            id=1,
            name="Laguuni Keilaniemi",
            slug="laguuni-keilis",
            city="Espoo",
            country="Finland",
            latitude=60.16905,
            longitude=24.833173,
            water_type="sea",
            website_url=(
                "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo"
            ),
            timezone="Europe/Helsinki",
            is_active=True,
            cables=[
                CableDB(
                    name="Pro Cable",
                    booking_url=(
                        "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-pro-cable"
                    ),
                ),
                CableDB(
                    name="Easy Cable",
                    booking_url=(
                        "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-easy-cable"
                    ),
                ),
            ],
        )

        db.add(park)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()