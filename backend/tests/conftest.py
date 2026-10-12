import pytest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.database import Base

# Register all SQLAlchemy models with Base.metadata.
from app.models.park_db import CableDB, ParkDB
from app.models.weather_db import (
    WeatherForecastDB,
    WeatherObservationDB,
    WeatherStationDB,
)


TEST_DATABASE_URL = "postgresql+psycopg://pyry@localhost/wakecast_test"


@pytest.fixture
def db():
    engine = create_engine(TEST_DATABASE_URL)

    try:
        with engine.connect() as connection:
            database_name = connection.execute(
                text("SELECT current_database()")
            ).scalar_one()

            if database_name != "wakecast_test":
                raise RuntimeError("Refusing to run tests outside wakecast_test")

        Base.metadata.create_all(engine)

        connection = engine.connect()
        transaction = connection.begin()

        try:
            session = Session(
                bind=connection,
                autoflush=False,
                join_transaction_mode="create_savepoint",
            )

            try:
                yield session
            finally:
                session.close()
        finally:
            transaction.rollback()
            connection.close()

    finally:
        engine.dispose()
