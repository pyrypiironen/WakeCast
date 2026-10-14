import runpy
from pathlib import Path
from unittest.mock import MagicMock, Mock

import pytest
import sqlalchemy
from alembic.config import Config
from sqlalchemy.engine import make_url

from alembic import context
from app import database


@pytest.mark.parametrize("offline", [True, False])
@pytest.mark.parametrize(
    ("database_url", "expected_password"),
    [
        (
            "postgresql+psycopg://tester:plain@localhost/wakecast_test",
            "plain",
        ),
        (
            "postgresql+psycopg://tester:p%40ss@localhost/wakecast_test",
            "p@ss",
        ),
        (
            "postgresql+psycopg://tester:p%25%40%2F%3A@localhost/wakecast_test",
            "p%@/:",
        ),
    ],
)
def test_alembic_preserves_encoded_database_url(
    monkeypatch,
    offline,
    database_url,
    expected_password,
):
    config = Config()
    configure = Mock()
    run_migrations = Mock()
    engine_factory = Mock(return_value=MagicMock())

    monkeypatch.setattr(database, "DATABASE_URL", database_url)
    monkeypatch.setattr(context, "config", config, raising=False)
    monkeypatch.setattr(
        context,
        "is_offline_mode",
        Mock(return_value=offline),
    )
    monkeypatch.setattr(context, "configure", configure)
    monkeypatch.setattr(
        context,
        "begin_transaction",
        MagicMock(),
    )
    monkeypatch.setattr(context, "run_migrations", run_migrations)
    monkeypatch.setattr(
        sqlalchemy,
        "engine_from_config",
        engine_factory,
    )

    env_path = Path(__file__).resolve().parents[1] / "alembic" / "env.py"
    runpy.run_path(str(env_path))

    if offline:
        engine_factory.assert_not_called()
        actual_url = configure.call_args.kwargs["url"]
    else:
        engine_factory.assert_called_once()
        actual_url = engine_factory.call_args.args[0]["sqlalchemy.url"]

    assert actual_url == database_url
    assert make_url(actual_url).password == expected_password
    configure.assert_called_once()
    run_migrations.assert_called_once_with()
