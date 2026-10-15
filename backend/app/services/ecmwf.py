from datetime import datetime, timezone

import httpx

from app.models.weather import WeatherForecast, WeatherResponse
from app.services.weather_errors import WeatherProviderError

OPEN_METEO_ECMWF_URL = "https://api.open-meteo.com/v1/ecmwf"

ECMWF_FIELD_MAP = {
    "temperature_2m": "temperature",
    "wind_speed_10m": "wind_speed",
    "wind_gusts_10m": "wind_gust",
    "wind_direction_10m": "wind_direction",
    "precipitation": "precipitation",
    "cloud_cover": "cloudiness",
}


def get_ecmwf_forecast(
    latitude: float,
    longitude: float,
) -> WeatherResponse:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(ECMWF_FIELD_MAP.keys()),
        "wind_speed_unit": "ms",
        # Includes today in UTC; 11 days cover the next 10 full Finnish local days
        # when the provider supplies all requested hours.
        "forecast_days": 11,
        "timezone": "UTC",
    }

    try:
        response = httpx.get(
            OPEN_METEO_ECMWF_URL,
            params=params,
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise WeatherProviderError("Open-Meteo ECMWF request failed") from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise WeatherProviderError("Open-Meteo ECMWF returned invalid JSON") from exc

    if not isinstance(data, dict):
        raise WeatherProviderError("Open-Meteo ECMWF returned an invalid response")

    hourly = data.get("hourly")

    if not isinstance(hourly, dict):
        raise WeatherProviderError("Open-Meteo ECMWF returned no hourly data")

    timestamps = hourly.get("time")

    if not isinstance(timestamps, list) or not all(
        isinstance(timestamp, str) for timestamp in timestamps
    ):
        raise WeatherProviderError("Open-Meteo ECMWF returned invalid timestamps")

    for field_name in ECMWF_FIELD_MAP:
        field_values = hourly.get(field_name)

        if not isinstance(field_values, list) or len(field_values) != len(timestamps):
            raise WeatherProviderError(
                "Open-Meteo ECMWF returned invalid hourly fields"
            )

    try:
        weather = parse_ecmwf_forecast(data)
    except (ValueError, TypeError, OverflowError) as exc:
        raise WeatherProviderError(
            "Open-Meteo ECMWF returned invalid forecast data"
        ) from exc

    if not weather.forecasts:
        raise WeatherProviderError(
            "Open-Meteo ECMWF returned no usable forecast points"
        )

    return weather


def parse_ecmwf_forecast(
    data: dict,
) -> WeatherResponse:
    hourly = data.get("hourly")

    if hourly is None:
        return WeatherResponse(
            forecast_location="Unknown",
            forecasts=[],
        )

    timestamps = hourly.get("time", [])

    forecasts = []

    for index, timestamp_text in enumerate(timestamps):
        values = {}

        for open_meteo_name, wakecast_name in ECMWF_FIELD_MAP.items():
            field_values = hourly.get(open_meteo_name)

            if (
                field_values is None
                or index >= len(field_values)
                or field_values[index] is None
            ):
                break

            values[wakecast_name] = float(field_values[index])

        else:
            timestamp = datetime.fromisoformat(timestamp_text).replace(
                tzinfo=timezone.utc
            )

            forecasts.append(
                WeatherForecast(
                    timestamp=timestamp,
                    source="ecmwf",
                    precipitation_probability=None,
                    **values,
                )
            )

    return WeatherResponse(
        forecast_location="Unknown",
        forecasts=forecasts,
    )
