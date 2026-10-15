"""Real PostgreSQL migrations, isolated in a rollback-only test schema."""

import os
from contextlib import nullcontext
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command
from app import database
from app.database import Base

REGIONAL_STATIONS = "4347c37e400c"
TIMESTAMP = datetime(2026, 10, 1, 12, tzinfo=UTC)
FETCHED_AT = datetime(2026, 10, 1, 13, tzinfo=UTC)


@pytest.fixture
def migration_db(monkeypatch):
    url = os.getenv("TEST_DATABASE_URL", "")
    if not url.strip() or make_url(url).database != "wakecast_test":
        raise RuntimeError(
            "Migration tests require TEST_DATABASE_URL for wakecast_test"
        )
    engine = sa.create_engine(url)
    try:
        with engine.connect() as connection, connection.begin():
            if (
                connection.scalar(sa.text("SELECT current_database()"))
                != "wakecast_test"
            ):
                raise RuntimeError("Refusing to run migrations outside wakecast_test")
            if connection.dialect.name != "postgresql":
                raise RuntimeError("Migration tests require PostgreSQL")
            schema = "migration_test_" + uuid4().hex
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            # Exclude public: missing tables must never resolve to existing data.
            connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            config = Config()
            config.set_main_option(
                "script_location",
                str(Path(__file__).resolve().parents[1] / "alembic"),
            )
            monkeypatch.setattr(database, "DATABASE_URL", url)
            # Exercise env.py and command.upgrade using this isolated connection.
            monkeypatch.setattr(
                sa,
                "engine_from_config",
                lambda *args, **kwargs: SimpleNamespace(
                    connect=lambda: nullcontext(connection)
                ),
            )
            try:
                yield connection, config
            finally:
                # PostgreSQL DDL is transactional: removes only our own schema.
                connection.rollback()
    finally:
        engine.dispose()


def insert(connection, table_name, **values):
    table = sa.Table(table_name, sa.MetaData(), autoload_with=connection)
    connection.execute(table.insert().values(**values))


def rows(connection, name):
    return [
        dict(row)
        for row in connection.execute(
            sa.text(f'SELECT * FROM "{name}" ORDER BY id')
        ).mappings()
    ]


def seed_park(connection):
    insert(
        connection,
        "parks",
        id=1,
        name="Migration Park",
        slug="migration-park",
        city="Espoo",
        country="Finland",
        latitude=60.17,
        longitude=24.83,
        water_type="sea",
        website_url="https://example.com",
        timezone="Europe/Helsinki",
        is_active=True,
    )
    insert(
        connection,
        "cables",
        id=1,
        park_id=1,
        name="Cable",
        booking_url="https://example.com/book",
    )


def seed_forecast(connection, **extra):
    insert(
        connection,
        "weather_forecasts",
        id=1,
        park_id=1,
        timestamp=TIMESTAMP,
        temperature=12.5,
        wind_speed=4.0,
        wind_gust=6.0,
        wind_direction=270.0,
        precipitation=0.0,
        precipitation_probability=None,
        cloudiness=50.0,
        source="fmi",
        **extra,
    )


def seed_observation(connection, **extra):
    insert(
        connection,
        "weather_observations",
        id=1,
        timestamp=TIMESTAMP,
        fetched_at=FETCHED_AT,
        observation_location="Test station",
        temperature=10.5,
        wind_speed=None,
        source="fmi",
        **extra,
    )


def assert_rejected(connection, sql, constraint):
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        connection.execute(sa.text(sql))
    assert error.value.orig.diag.constraint_name == constraint


def test_empty_database_upgrades_to_head(migration_db):
    connection, config = migration_db
    command.upgrade(config, "head")
    assert (
        connection.scalar(sa.text("SELECT version_num FROM alembic_version"))
        == ScriptDirectory.from_config(config).get_current_head()
    )
    inspector = sa.inspect(connection)
    assert set(inspector.get_table_names()) == set(Base.metadata.tables) | {
        "alembic_version"
    }
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in inspector.get_columns(name)} == set(
            table.columns.keys()
        )


def test_supported_populated_upgrade_preserves_data_and_constraints(migration_db):
    connection, config = migration_db
    command.upgrade(config, REGIONAL_STATIONS)
    seed_park(connection)
    seed_forecast(connection, fetched_at=FETCHED_AT, forecast_location="Karhusaari")
    insert(
        connection,
        "weather_stations",
        id=1,
        name="Test station",
        region="Espoo",
        source="fmi",
        source_station_id=100971,
        is_active=True,
    )
    seed_observation(
        connection,
        weather_station_id=1,
        resolution_minutes=10,
        is_aggregated=False,
        water_temperature=14.5,
    )
    before = {
        name: rows(connection, name)
        for name in (
            "parks",
            "cables",
            "weather_forecasts",
            "weather_stations",
            "weather_observations",
        )
    }

    command.upgrade(config, "cae5c932c8e6")
    assert rows(connection, "parks")[0]["observation_station_id"] is None
    connection.execute(sa.text("UPDATE parks SET observation_station_id = 1"))
    command.upgrade(config, "e6d3bd581322")
    assert rows(connection, "parks")[0]["water_temperature_station_id"] is None
    insert(
        connection,
        "water_temperature_stations",
        id=1,
        name="Water sensor",
        latitude=60.17,
        longitude=24.83,
        source="uiras",
        source_station_id="sensor-1",
        is_active=True,
    )
    connection.execute(sa.text("UPDATE parks SET water_temperature_station_id = 1"))
    command.upgrade(config, "716230ed55bc")
    insert(
        connection,
        "water_temperature_observations",
        id=1,
        water_temperature_station_id=1,
        timestamp=TIMESTAMP,
        fetched_at=FETCHED_AT,
        water_temperature=15.5,
    )
    water_before = rows(connection, "water_temperature_observations")
    command.upgrade(config, "head")

    for name, expected in before.items():
        actual = rows(connection, name)

        if name == "parks":
            expected[0].update(
                observation_station_id=1,
                water_temperature_station_id=1,
                website_url_fi=None,
            )

        if name == "cables":
            expected[0]["booking_url_fi"] = None

        if name == "weather_observations":
            expected[0].pop("water_temperature")

        assert actual == expected

    assert rows(connection, "water_temperature_observations") == water_before
    assert_rejected(
        connection,
        "UPDATE parks SET observation_station_id = 999",
        "fk_parks_observation_station_id",
    )
    assert_rejected(
        connection,
        "UPDATE parks SET water_temperature_station_id = 999",
        "fk_parks_water_temperature_station_id",
    )
    assert_rejected(
        connection,
        "UPDATE water_temperature_observations SET water_temperature_station_id = 999",
        "fk_water_temperature_observations_station_id",
    )
    assert_rejected(
        connection,
        "INSERT INTO water_temperature_observations "
        "(id, water_temperature_station_id, timestamp, fetched_at, water_temperature) "
        "SELECT 2, water_temperature_station_id, timestamp, fetched_at, water_temperature "
        "FROM water_temperature_observations",
        "uq_water_temperature_observations_station_timestamp",
    )


def test_forecast_location_backfill_preserves_existing_forecast(migration_db):
    connection, config = migration_db
    command.upgrade(config, "20c278471a60")
    seed_park(connection)
    seed_forecast(connection, fetched_at=FETCHED_AT)
    expected = rows(connection, "weather_forecasts")
    command.upgrade(config, "a6866898784f")
    expected[0]["forecast_location"] = "Karhusaari"
    assert rows(connection, "weather_forecasts") == expected


@pytest.mark.parametrize(
    "starting_revision, target, table, missing_column",
    [
        ("3f6f22299604", "20c278471a60", "weather_forecasts", "fetched_at"),
        (
            "4588410a59a8",
            REGIONAL_STATIONS,
            "weather_observations",
            "weather_station_id",
        ),
    ],
)
def test_unsupported_populated_upgrade_rolls_back(
    migration_db, starting_revision, target, table, missing_column
):
    connection, config = migration_db
    command.upgrade(config, starting_revision)
    seed_park(connection)
    if table == "weather_forecasts":
        seed_forecast(connection)
    else:
        seed_observation(
            connection,
            observation_station_id=100971,
            resolution_minutes=10,
            is_aggregated=False,
        )
    expected = rows(connection, table)
    tables_before = sa.inspect(connection).get_table_names()
    with pytest.raises(IntegrityError) as error, connection.begin_nested():
        command.upgrade(config, target)
    assert error.value.orig.sqlstate == "23502"
    assert error.value.orig.diag.column_name == missing_column
    assert rows(connection, table) == expected
    assert sa.inspect(connection).get_table_names() == tables_before
    assert missing_column not in {
        c["name"] for c in sa.inspect(connection).get_columns(table)
    }
    assert (
        connection.scalar(sa.text("SELECT version_num FROM alembic_version"))
        == starting_revision
    )


def test_historical_regional_refactor_discards_observations_only(migration_db):
    connection, config = migration_db
    command.upgrade(config, "419148974b79")
    seed_park(connection)
    seed_forecast(connection, fetched_at=FETCHED_AT, forecast_location="Karhusaari")
    seed_observation(connection, park_id=1, observation_station_id=100971)
    preserved = {
        name: rows(connection, name)
        for name in ("parks", "cables", "weather_forecasts")
    }
    assert len(rows(connection, "weather_observations")) == 1
    command.upgrade(config, "4588410a59a8")
    assert rows(connection, "weather_observations") == []
    for name, expected in preserved.items():
        assert rows(connection, name) == expected
