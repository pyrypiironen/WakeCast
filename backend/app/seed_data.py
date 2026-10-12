WEATHER_STATIONS = {
    "helsinki-kaisaniemi": {
        "name": "Helsinki Kaisaniemi",
        "region": "helsinki",
        "source": "fmi",
        "source_station_id": 100971,
        "is_active": True,
    },
}

WATER_TEMPERATURE_STATIONS = {
    "lauttasaari-mattolaituri": {
        "name": "Lauttasaaren mattolaituri",
        "latitude": 60.1707,
        "longitude": 24.8579,
        "source": "uiras",
        "source_station_id": "70B3D57050004CDB",
        "is_active": True,
    },
}

PARKS = [
    {
        "name": "Laguuni Keilaniemi",
        "slug": "laguuni-keilis",
        "city": "Espoo",
        "country": "Finland",
        "latitude": 60.16905,
        "longitude": 24.833173,
        "water_type": "sea",
        "website_url": "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo",
        "timezone": "Europe/Helsinki",
        "is_active": True,
        "observation_station_key": "helsinki-kaisaniemi",
        "water_temperature_station_key": "lauttasaari-mattolaituri",
        "cables": [
            {
                "name": "Pro Cable",
                "booking_url": "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-pro-cable",
            },
            {
                "name": "Easy Cable",
                "booking_url": "https://shop.laguuniin.fi/en_US/locations/keilaniemi-espoo/wakeboarding-keilis/wakeboarding-easy-cable",
            },
        ],
    },
]
