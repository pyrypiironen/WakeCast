import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.database import Base

# Register all SQLAlchemy models with Base.metadata.


@pytest.fixture
def db():
    database_url = os.getenv("TEST_DATABASE_URL")

    if not database_url or not database_url.strip():
        raise RuntimeError(
            "TEST_DATABASE_URL must be set in the environment or backend/.env"
        )

    if make_url(database_url).database != "wakecast_test":
        raise RuntimeError("Refusing to run tests outside wakecast_test")

    engine = create_engine(database_url)

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
