from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.park_db import ParkDB
from app.models.weather_db import WeatherForecastDB, WeatherObservationDB


@dataclass
class ForecastObservationPair:
    forecast: WeatherForecastDB
    observation: WeatherObservationDB
    lead_time_hours: float


@dataclass(frozen=True)
class LeadTimeBucket:
    name: str
    min_hours: float
    max_hours: float | None
    target_hours: float


LEAD_TIME_BUCKETS = [
    LeadTimeBucket("0-3h", 0, 3, 1.5),
    LeadTimeBucket("3-12h", 3, 12, 7.5),
    LeadTimeBucket("12-24h", 12, 24, 18),
    LeadTimeBucket("24-48h", 24, 48, 36),
    LeadTimeBucket("48-72h", 48, 72, 60),
    LeadTimeBucket("72h+", 72, None, 96),
]


def get_forecast_observation_pairs(
    db: Session,
    park_id: int,
    start_time: datetime,
    end_time: datetime,
) -> list[ForecastObservationPair]:
    park = db.get(ParkDB, park_id)

    if park is None:
        raise ValueError(f"Park {park_id} not found")

    if park.observation_station_id is None:
        raise ValueError(f"Park {park_id} has no reference observation station")

    statement = (
        select(WeatherForecastDB, WeatherObservationDB)
        .join(
            WeatherObservationDB,
            WeatherObservationDB.timestamp == WeatherForecastDB.timestamp,
        )
        .where(
            WeatherForecastDB.park_id == park_id,
            WeatherObservationDB.weather_station_id == park.observation_station_id,
            WeatherForecastDB.timestamp >= start_time,
            WeatherForecastDB.timestamp < end_time,
            WeatherForecastDB.fetched_at <= WeatherForecastDB.timestamp,
        )
        .order_by(
            WeatherForecastDB.timestamp,
            WeatherForecastDB.fetched_at,
        )
    )

    rows = db.execute(statement).all()

    return [
        ForecastObservationPair(
            forecast=forecast,
            observation=observation,
            lead_time_hours=(forecast.timestamp - forecast.fetched_at).total_seconds()
            / 3600,
        )
        for forecast, observation in rows
    ]


def get_lead_time_bucket(
    lead_time_hours: float,
) -> LeadTimeBucket | None:
    for bucket in LEAD_TIME_BUCKETS:
        if lead_time_hours >= bucket.min_hours and (
            bucket.max_hours is None or lead_time_hours < bucket.max_hours
        ):
            return bucket

    return None


def select_representative_pairs(
    pairs: list[ForecastObservationPair],
) -> dict[str, list[ForecastObservationPair]]:
    selected: dict[
        tuple[datetime, str, str],
        ForecastObservationPair,
    ] = {}

    for pair in pairs:
        bucket = get_lead_time_bucket(pair.lead_time_hours)

        if bucket is None:
            continue

        key = (
            pair.forecast.timestamp,
            pair.forecast.source,
            bucket.name,
        )

        existing = selected.get(key)

        if existing is None or abs(pair.lead_time_hours - bucket.target_hours) < abs(
            existing.lead_time_hours - bucket.target_hours
        ):
            selected[key] = pair

    grouped = {bucket.name: [] for bucket in LEAD_TIME_BUCKETS}

    for (_, _, bucket_name), pair in selected.items():
        grouped[bucket_name].append(pair)

    return grouped


@dataclass
class AccuracyMetrics:
    source: str
    lead_time_bucket: str
    variable: str
    sample_count: int
    mae: float
    bias: float


def calculate_accuracy_metrics(
    grouped_pairs: dict[str, list[ForecastObservationPair]],
) -> list[AccuracyMetrics]:
    results = []

    variables = ("temperature", "wind_speed")

    for bucket_name, pairs in grouped_pairs.items():
        sources = sorted(set(pair.forecast.source for pair in pairs))

        for source in sources:
            source_pairs = [pair for pair in pairs if pair.forecast.source == source]

            for variable in variables:
                errors = []

                for pair in source_pairs:
                    forecast_value = getattr(pair.forecast, variable)
                    observed_value = getattr(pair.observation, variable)

                    if forecast_value is None or observed_value is None:
                        continue

                    errors.append(forecast_value - observed_value)

                if not errors:
                    continue

                results.append(
                    AccuracyMetrics(
                        source=source,
                        lead_time_bucket=bucket_name,
                        variable=variable,
                        sample_count=len(errors),
                        mae=sum(abs(error) for error in errors) / len(errors),
                        bias=sum(errors) / len(errors),
                    )
                )

    return results
