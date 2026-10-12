from copy import deepcopy

import pytest

from app import seed
from app.models.park_db import CableDB, ParkDB
from app.seed_data import PARKS, WATER_TEMPERATURE_STATIONS, WEATHER_STATIONS


@pytest.fixture
def seed_config(monkeypatch):
    weather_stations = deepcopy(WEATHER_STATIONS)
    water_stations = deepcopy(WATER_TEMPERATURE_STATIONS)
    parks = deepcopy(PARKS)

    weather_stations["helsinki-kaisaniemi"]["source_station_id"] = 999990001
    water_stations["lauttasaari-mattolaituri"]["source_station_id"] = (
        "seed-test-water-sensor"
    )
    parks[0]["slug"] = "seed-test-park"

    monkeypatch.setattr(seed, "WEATHER_STATIONS", weather_stations)
    monkeypatch.setattr(seed, "WATER_TEMPERATURE_STATIONS", water_stations)
    monkeypatch.setattr(seed, "PARKS", parks)

    return weather_stations, water_stations, parks


def get_seeded_park(db):
    return db.query(ParkDB).filter(ParkDB.slug == "seed-test-park").one()


def test_repeated_seed_preserves_rows_and_ids(db, seed_config):
    seed.seed_records(db)
    park = get_seeded_park(db)

    original_ids = (
        park.id,
        park.observation_station_id,
        park.water_temperature_station_id,
    )
    original_cables = {cable.name: cable.id for cable in park.cables}

    seed.seed_records(db)
    db.expire_all()
    park = get_seeded_park(db)

    assert (
        park.id,
        park.observation_station_id,
        park.water_temperature_station_id,
    ) == original_ids

    assert len(park.cables) == 2
    assert {cable.name: cable.id for cable in park.cables} == original_cables
    assert park.observation_station.source_station_id == 999990001
    assert park.water_temperature_station.source_station_id == "seed-test-water-sensor"


def test_seed_updates_details_and_preserves_extra_cables(db, seed_config):
    weather_stations, water_stations, parks = seed_config

    seed.seed_records(db)
    park = get_seeded_park(db)
    original_park_id = park.id
    original_cable_id = next(
        cable.id for cable in park.cables if cable.name == "Pro Cable"
    )

    extra_cable = CableDB(
        name="Extra Cable",
        booking_url="https://example.com/extra",
    )
    park.cables.append(extra_cable)
    db.flush()
    extra_cable_id = extra_cable.id

    parks[0]["name"] = "Updated Park"
    parks[0]["city"] = "Helsinki"
    parks[0]["website_url"] = "https://example.com/updated-park"
    parks[0]["cables"][0]["booking_url"] = "https://example.com/updated-booking"
    parks[0]["cables"].append(
        {
            "name": "New Cable",
            "booking_url": "https://example.com/new-cable",
        }
    )
    weather_stations["helsinki-kaisaniemi"]["name"] = "Updated Weather Station"
    water_stations["lauttasaari-mattolaituri"]["name"] = "Updated Water Station"

    seed.seed_records(db)
    db.expire_all()
    park = get_seeded_park(db)
    cables = {cable.name: cable for cable in park.cables}

    assert park.id == original_park_id
    assert park.name == "Updated Park"
    assert park.city == "Helsinki"
    assert park.website_url == "https://example.com/updated-park"
    assert park.observation_station.name == "Updated Weather Station"
    assert park.water_temperature_station.name == "Updated Water Station"
    assert len(park.cables) == 4
    assert cables["Pro Cable"].id == original_cable_id
    assert cables["Pro Cable"].booking_url == "https://example.com/updated-booking"
    assert cables["Extra Cable"].id == extra_cable_id
    assert cables["Extra Cable"].booking_url == "https://example.com/extra"
    assert cables["New Cable"].booking_url == "https://example.com/new-cable"


def test_seed_adds_another_park_without_fixed_id(db, seed_config):
    _, _, parks = seed_config

    seed.seed_records(db)
    first_park_id = get_seeded_park(db).id

    second_park_data = deepcopy(parks[0])
    second_park_data["slug"] = "second-seed-test-park"
    second_park_data["name"] = "Second Seed Test Park"
    second_park_data["observation_station_key"] = None
    second_park_data["water_temperature_station_key"] = None
    second_park_data["cables"] = []
    parks.append(second_park_data)

    seed.seed_records(db)
    db.expire_all()

    first_park = get_seeded_park(db)
    second_park = db.query(ParkDB).filter(ParkDB.slug == "second-seed-test-park").one()

    assert first_park.id == first_park_id
    assert second_park.id != first_park.id
    assert second_park.name == "Second Seed Test Park"
    assert second_park.observation_station_id is None
    assert second_park.water_temperature_station_id is None
    assert second_park.cables == []
