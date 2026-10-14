from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.orm import Session

from app.services import weather_refresh
from app.services.weather_refresh_lock import (
    ForecastRefreshInProgress,
    acquire_forecast_refresh_lock,
)


@pytest.mark.parametrize("finish", ["commit", "rollback"])
def test_forecast_lock_is_per_park_and_released(db, finish):
    engine = db.get_bind().engine

    with Session(bind=engine) as first, Session(bind=engine) as second:
        acquire_forecast_refresh_lock(first, park_id=900001)

        with pytest.raises(ForecastRefreshInProgress):
            acquire_forecast_refresh_lock(second, park_id=900001)

        # Another park remains available while the first is locked.
        acquire_forecast_refresh_lock(second, park_id=900002)

        getattr(first, finish)()

        # The competing connection can now acquire the original park.
        acquire_forecast_refresh_lock(second, park_id=900001)


def test_blocked_refresh_does_not_fetch_or_save(db, monkeypatch):
    engine = db.get_bind().engine
    fetch = Mock()
    save = Mock()

    monkeypatch.setattr(weather_refresh, "get_provider_forecasts", fetch)
    monkeypatch.setattr(weather_refresh, "save_forecast_snapshot", save)

    park = SimpleNamespace(
        id=900003,
        latitude=60.0,
        longitude=24.0,
    )

    with Session(bind=engine) as owner, Session(bind=engine) as contender:
        acquire_forecast_refresh_lock(owner, park_id=park.id)

        with pytest.raises(ForecastRefreshInProgress):
            weather_refresh.refresh_park_forecast(
                db=contender,
                park=park,
            )

        fetch.assert_not_called()
        save.assert_not_called()
        contender.rollback()
