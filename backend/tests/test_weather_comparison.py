
import pytest

from app.services.weather_comparison import get_lead_time_bucket


@pytest.mark.parametrize(
    ("lead_time", "expected_bucket"),
    [
        (0, "0-3h"),
        (1.5, "0-3h"),
        (2.99, "0-3h"),
        (3, "3-12h"),
        (12, "12-24h"),
        (24, "24-48h"),
        (48, "48-72h"),
        (72, "72h+"),
        (120, "72h+"),
        (-1, None),
    ],
)
def test_lead_time_bucket(lead_time, expected_bucket):
    bucket = get_lead_time_bucket(lead_time)

    actual = bucket.name if bucket is not None else None

    assert actual == expected_bucket



from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.weather_comparison import (
    ForecastObservationPair,
    select_representative_pairs,
)


def make_pair(
    lead_time_hours: float,
    source: str = "harmonie",
    valid_time: datetime | None = None,
) -> ForecastObservationPair:
    if valid_time is None:
        valid_time = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)

    forecast = SimpleNamespace(
        timestamp=valid_time,
        fetched_at=valid_time - timedelta(hours=lead_time_hours),
        source=source,
    )

    observation = SimpleNamespace(timestamp=valid_time)

    return ForecastObservationPair(
        forecast=forecast,
        observation=observation,
        lead_time_hours=lead_time_hours,
    )


def test_selects_closest_to_bucket_target():
    pairs = [
        make_pair(0.2),
        make_pair(0.7),
        make_pair(1.4),
    ]

    grouped = select_representative_pairs(pairs)

    assert len(grouped["0-3h"]) == 1
    assert grouped["0-3h"][0].lead_time_hours == 1.4


def test_keeps_forecast_sources_separate():
    pairs = [
        make_pair(50, source="harmonie"),
        make_pair(60, source="ecmwf"),
    ]

    grouped = select_representative_pairs(pairs)

    assert len(grouped["48-72h"]) == 2
    assert {
        pair.forecast.source for pair in grouped["48-72h"]
    } == {"harmonie", "ecmwf"}


def test_keeps_observation_timestamps_separate():
    first_time = datetime(2026, 10, 7, 12, tzinfo=timezone.utc)
    second_time = first_time + timedelta(hours=1)

    pairs = [
        make_pair(1.5, valid_time=first_time),
        make_pair(1.5, valid_time=second_time),
    ]

    grouped = select_representative_pairs(pairs)

    assert len(grouped["0-3h"]) == 2



from app.services.weather_comparison import calculate_accuracy_metrics


def make_metric_pair(
    temperature_forecast: float,
    temperature_observed: float | None,
    wind_forecast: float,
    wind_observed: float | None,
) -> ForecastObservationPair:
    pair = make_pair(1.5)

    pair.forecast.temperature = temperature_forecast
    pair.forecast.wind_speed = wind_forecast
    pair.observation.temperature = temperature_observed
    pair.observation.wind_speed = wind_observed

    return pair


def test_accuracy_metrics_mae_and_bias():
    pairs = [
        make_metric_pair(11.0, 10.0, 6.0, 5.0),
        make_metric_pair(8.0, 10.0, 4.0, 5.0),
    ]

    grouped = {"0-3h": pairs}
    metrics = calculate_accuracy_metrics(grouped)

    by_variable = {metric.variable: metric for metric in metrics}

    temperature = by_variable["temperature"]
    assert temperature.sample_count == 2
    assert temperature.mae == pytest.approx(1.5)
    assert temperature.bias == pytest.approx(-0.5)

    wind = by_variable["wind_speed"]
    assert wind.sample_count == 2
    assert wind.mae == pytest.approx(1.0)
    assert wind.bias == pytest.approx(0.0)


def test_accuracy_metrics_skip_missing_observations():
    pairs = [
        make_metric_pair(11.0, 10.0, 6.0, None),
        make_metric_pair(12.0, None, 7.0, 5.0),
    ]

    metrics = calculate_accuracy_metrics({"0-3h": pairs})
    by_variable = {metric.variable: metric for metric in metrics}

    assert by_variable["temperature"].sample_count == 1
    assert by_variable["temperature"].mae == pytest.approx(1.0)

    assert by_variable["wind_speed"].sample_count == 1
    assert by_variable["wind_speed"].mae == pytest.approx(2.0)


def test_accuracy_metrics_empty_pairs():
    metrics = calculate_accuracy_metrics({"0-3h": []})

    assert metrics == []


