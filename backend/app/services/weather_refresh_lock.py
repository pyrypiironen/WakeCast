from sqlalchemy import text
from sqlalchemy.orm import Session

# Reserved namespace for WakeCast park forecast refresh locks.
FORECAST_REFRESH_LOCK_NAMESPACE = 1


class ForecastRefreshInProgress(Exception):
    """Another transaction is already refreshing this park."""


def acquire_forecast_refresh_lock(
    db: Session,
    park_id: int,
) -> None:
    acquired = db.execute(
        text("SELECT pg_try_advisory_xact_lock(:namespace, :park_id)"),
        {
            "namespace": FORECAST_REFRESH_LOCK_NAMESPACE,
            "park_id": park_id,
        },
    ).scalar_one()

    if not acquired:
        raise ForecastRefreshInProgress("Weather forecast refresh already in progress")
