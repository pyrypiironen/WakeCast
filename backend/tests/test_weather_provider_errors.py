from unittest.mock import Mock

import httpx
import pytest

from app.services import ecmwf, fmi_forecast
from app.services.weather_errors import WeatherProviderError


@pytest.fixture
def provider(monkeypatch, request):
    module, function_name = request.param
    response = Mock()
    get = Mock(return_value=response)

    monkeypatch.setattr(module.httpx, "get", get)

    return getattr(module, function_name), response, get


PROVIDERS = [
    (fmi_forecast, "get_fmi_edited_forecast"),
    (ecmwf, "get_ecmwf_forecast"),
]


@pytest.mark.parametrize("provider", PROVIDERS, indirect=True)
def test_provider_timeout(provider):
    fetch, _, get = provider
    original_error = httpx.ReadTimeout("Simulated timeout")
    get.side_effect = original_error

    with pytest.raises(WeatherProviderError) as caught:
        fetch(60.0, 24.0)

    assert caught.value.__cause__ is original_error


@pytest.mark.parametrize("provider", PROVIDERS, indirect=True)
def test_provider_http_error(provider):
    fetch, response, _ = provider

    request = httpx.Request("GET", "https://example.com")
    upstream_response = httpx.Response(503, request=request)
    original_error = httpx.HTTPStatusError(
        "Provider unavailable",
        request=request,
        response=upstream_response,
    )
    response.raise_for_status.side_effect = original_error

    with pytest.raises(WeatherProviderError) as caught:
        fetch(60.0, 24.0)

    assert caught.value.__cause__ is original_error


@pytest.mark.parametrize(
    "xml_text",
    [
        "<broken",
        "<root/>",
    ],
)
def test_fmi_rejects_invalid_or_empty_forecast(monkeypatch, xml_text):
    response = Mock()
    response.text = xml_text

    monkeypatch.setattr(
        fmi_forecast.httpx,
        "get",
        Mock(return_value=response),
    )

    with pytest.raises(WeatherProviderError):
        fmi_forecast.get_fmi_edited_forecast(60.0, 24.0)


@pytest.fixture
def valid_ecmwf_data():
    hourly = {
        "time": ["2026-10-12T12:00"],
        "temperature_2m": [12.0],
        "wind_speed_10m": [4.0],
        "wind_gusts_10m": [7.0],
        "wind_direction_10m": [180.0],
        "precipitation": [0.0],
        "cloud_cover": [50.0],
    }

    return {"hourly": hourly}


def mock_ecmwf_response(monkeypatch, data):
    response = Mock()
    response.json.return_value = data

    monkeypatch.setattr(
        ecmwf.httpx,
        "get",
        Mock(return_value=response),
    )

    return response


def test_ecmwf_invalid_json(monkeypatch):
    response = mock_ecmwf_response(monkeypatch, None)
    response.json.side_effect = ValueError("Invalid JSON")

    with pytest.raises(WeatherProviderError):
        ecmwf.get_ecmwf_forecast(60.0, 24.0)


@pytest.mark.parametrize(
    "data",
    [
        [],
        {},
        {"hourly": []},
        {"hourly": {"time": "invalid"}},
        {"hourly": {"time": [123]}},
    ],
)
def test_ecmwf_invalid_response_structure(monkeypatch, data):
    mock_ecmwf_response(monkeypatch, data)

    with pytest.raises(WeatherProviderError):
        ecmwf.get_ecmwf_forecast(60.0, 24.0)


@pytest.mark.parametrize(
    "field_values",
    [
        None,
        "invalid",
        [],
        [1.0, 2.0],
        ["not-a-number"],
        [None],
    ],
)
def test_ecmwf_invalid_or_unusable_fields(
    monkeypatch,
    valid_ecmwf_data,
    field_values,
):
    valid_ecmwf_data["hourly"]["temperature_2m"] = field_values
    mock_ecmwf_response(monkeypatch, valid_ecmwf_data)

    with pytest.raises(WeatherProviderError):
        ecmwf.get_ecmwf_forecast(60.0, 24.0)


def test_ecmwf_valid_response(monkeypatch, valid_ecmwf_data):
    mock_ecmwf_response(monkeypatch, valid_ecmwf_data)

    weather = ecmwf.get_ecmwf_forecast(60.0, 24.0)

    assert len(weather.forecasts) == 1
    assert weather.forecasts[0].temperature == 12.0
    assert weather.forecasts[0].source == "ecmwf"


def test_ecmwf_internal_error_is_not_provider_error(
    monkeypatch,
    valid_ecmwf_data,
):
    mock_ecmwf_response(monkeypatch, valid_ecmwf_data)

    def broken_parser(data):
        raise RuntimeError("Simulated programming error")

    monkeypatch.setattr(
        ecmwf,
        "parse_ecmwf_forecast",
        broken_parser,
    )

    with pytest.raises(
        RuntimeError,
        match="Simulated programming error",
    ):
        ecmwf.get_ecmwf_forecast(60.0, 24.0)
