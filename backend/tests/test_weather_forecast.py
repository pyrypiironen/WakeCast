from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest

from app.models.weather import WeatherForecast, WeatherResponse
from app.services import weather_forecast
from app.services.weather_errors import WeatherProviderError


@pytest.fixture
def provider_responses():
    timestamp = datetime(2026, 10, 14, 12, tzinfo=UTC)

    def point(source, valid_time, wind_speed):
        return WeatherForecast(
            timestamp=valid_time,
            temperature=12.0,
            wind_speed=wind_speed,
            wind_gust=9.0,
            wind_direction=180.0,
            precipitation=0.0,
            precipitation_probability=None,
            cloudiness=50.0,
            source=source,
        )

    fmi = WeatherResponse(
        forecast_location="Keilaniemi",
        forecasts=[
            point("fmi_edited", timestamp, 5.0),
        ],
    )

    ecmwf = WeatherResponse(
        forecast_location="Unknown",
        forecasts=[
            point("ecmwf", timestamp + timedelta(hours=1), 8.0),
            point("ecmwf", timestamp, 7.0),
        ],
    )

    return fmi, ecmwf


def test_fetch_preserves_both_provider_responses(monkeypatch, provider_responses):
    fmi, ecmwf = provider_responses
    fetch_fmi = Mock(return_value=fmi)
    fetch_ecmwf = Mock(return_value=ecmwf)

    monkeypatch.setattr(weather_forecast, "get_fmi_edited_forecast", fetch_fmi)
    monkeypatch.setattr(weather_forecast, "get_ecmwf_forecast", fetch_ecmwf)

    actual_fmi, actual_ecmwf = weather_forecast.get_provider_forecasts(
        60.16905,
        24.833173,
    )

    assert actual_fmi is fmi
    assert actual_ecmwf is ecmwf
    assert len(actual_fmi.forecasts) == 1
    assert len(actual_ecmwf.forecasts) == 2
    assert actual_ecmwf.forecasts[1].wind_speed == 7.0

    fetch_fmi.assert_called_once_with(60.16905, 24.833173)
    fetch_ecmwf.assert_called_once_with(60.16905, 24.833173)


def test_merge_prefers_fmi_without_modifying_originals(provider_responses):
    fmi, ecmwf = provider_responses
    original_fmi = fmi.model_dump()
    original_ecmwf = ecmwf.model_dump()

    merged = weather_forecast.merge_forecasts(fmi, ecmwf)

    assert merged.forecast_location == "Keilaniemi"
    assert len(merged.forecasts) == 2
    assert [point.wind_speed for point in merged.forecasts] == [5.0, 8.0]
    assert [point.source for point in merged.forecasts] == ["fmi_edited", "ecmwf"]
    assert merged.forecasts[0].timestamp < merged.forecasts[1].timestamp

    assert fmi.model_dump() == original_fmi
    assert ecmwf.model_dump() == original_ecmwf


def test_get_forecast_returns_merged_response(monkeypatch, provider_responses):
    fetch = Mock(return_value=provider_responses)
    monkeypatch.setattr(weather_forecast, "get_provider_forecasts", fetch)

    merged = weather_forecast.get_forecast(60.16905, 24.833173)

    assert [point.wind_speed for point in merged.forecasts] == [5.0, 8.0]
    fetch.assert_called_once_with(60.16905, 24.833173)


@pytest.mark.parametrize("failed_source", ["fmi_edited", "ecmwf"])
def test_fetch_continues_when_one_provider_fails(
    monkeypatch,
    provider_responses,
    failed_source,
):
    fmi, ecmwf = provider_responses
    fetch_fmi = Mock(return_value=fmi)
    fetch_ecmwf = Mock(return_value=ecmwf)

    if failed_source == "fmi_edited":
        fetch_fmi.side_effect = WeatherProviderError("FMI unavailable")
    else:
        fetch_ecmwf.side_effect = WeatherProviderError("ECMWF unavailable")

    monkeypatch.setattr(
        weather_forecast,
        "get_fmi_edited_forecast",
        fetch_fmi,
    )
    monkeypatch.setattr(
        weather_forecast,
        "get_ecmwf_forecast",
        fetch_ecmwf,
    )

    actual_fmi, actual_ecmwf = weather_forecast.get_provider_forecasts(
        60.16905,
        24.833173,
    )

    fetch_fmi.assert_called_once_with(60.16905, 24.833173)
    fetch_ecmwf.assert_called_once_with(60.16905, 24.833173)

    if failed_source == "fmi_edited":
        assert actual_fmi.forecasts == []
        assert actual_ecmwf is ecmwf
        expected = ecmwf
    else:
        assert actual_fmi is fmi
        assert actual_ecmwf.forecasts == []
        expected = fmi

    merged = weather_forecast.merge_forecasts(actual_fmi, actual_ecmwf)

    assert merged.forecast_location == expected.forecast_location
    assert merged.forecasts == sorted(
        expected.forecasts,
        key=lambda point: point.timestamp,
    )


def test_fetch_raises_when_both_providers_fail(monkeypatch):
    fetch_fmi = Mock(side_effect=WeatherProviderError("FMI unavailable"))
    fetch_ecmwf = Mock(side_effect=WeatherProviderError("ECMWF unavailable"))

    monkeypatch.setattr(
        weather_forecast,
        "get_fmi_edited_forecast",
        fetch_fmi,
    )
    monkeypatch.setattr(
        weather_forecast,
        "get_ecmwf_forecast",
        fetch_ecmwf,
    )

    with pytest.raises(
        WeatherProviderError,
        match="Both forecast providers are unavailable",
    ):
        weather_forecast.get_provider_forecasts(60.16905, 24.833173)

    fetch_fmi.assert_called_once_with(60.16905, 24.833173)
    fetch_ecmwf.assert_called_once_with(60.16905, 24.833173)


def test_fetch_rejects_two_empty_provider_responses(monkeypatch):
    empty = WeatherResponse(
        forecast_location="Unknown",
        forecasts=[],
    )

    monkeypatch.setattr(
        weather_forecast,
        "get_fmi_edited_forecast",
        Mock(return_value=empty),
    )
    monkeypatch.setattr(
        weather_forecast,
        "get_ecmwf_forecast",
        Mock(return_value=empty),
    )

    with pytest.raises(
        WeatherProviderError,
        match="Both forecast providers are unavailable",
    ):
        weather_forecast.get_provider_forecasts(60.16905, 24.833173)


@pytest.mark.parametrize(
    "broken_function",
    ["get_fmi_edited_forecast", "get_ecmwf_forecast"],
)
def test_fetch_does_not_hide_programming_errors(
    monkeypatch,
    provider_responses,
    broken_function,
):
    fmi, ecmwf = provider_responses

    monkeypatch.setattr(
        weather_forecast,
        "get_fmi_edited_forecast",
        Mock(return_value=fmi),
    )
    monkeypatch.setattr(
        weather_forecast,
        "get_ecmwf_forecast",
        Mock(return_value=ecmwf),
    )

    original_error = RuntimeError("Simulated programming error")
    monkeypatch.setattr(
        weather_forecast,
        broken_function,
        Mock(side_effect=original_error),
    )

    with pytest.raises(RuntimeError) as caught:
        weather_forecast.get_provider_forecasts(60.16905, 24.833173)

    assert caught.value is original_error
