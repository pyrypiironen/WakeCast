from datetime import datetime, timezone

import httpx

from app.models.weather import WeatherForecast, WeatherResponse


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
        "forecast_days": 10,
        "timezone": "UTC",
    }

    response = httpx.get(
        OPEN_METEO_ECMWF_URL,
        params=params,
        timeout=30.0,
    )

    response.raise_for_status()

    return parse_ecmwf_forecast(response.json())


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
            timestamp = datetime.fromisoformat(
                timestamp_text
            ).replace(tzinfo=timezone.utc)

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