from app.models.park import Park


parks = [
    Park(
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
        cables=[
            {
                "name": "Pro Cable",
                "booking_url": "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-pro-cable",
            },
            {
                "name": "Easy Cable",
                "booking_url": "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-easy-cable",
            },
        ],
    )
]