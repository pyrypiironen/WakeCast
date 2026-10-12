from app.models.weather import WeatherResponse
from app.services.ecmwf import get_ecmwf_forecast
from app.services.fmi_forecast import get_harmonie_forecast


def merge_forecasts(
    harmonie: WeatherResponse,
    ecmwf: WeatherResponse,
) -> WeatherResponse:
    forecasts_by_timestamp = {
        forecast.timestamp: forecast for forecast in ecmwf.forecasts
    }

    for forecast in harmonie.forecasts:
        forecasts_by_timestamp[forecast.timestamp] = forecast

    merged_forecasts = sorted(
        forecasts_by_timestamp.values(),
        key=lambda forecast: forecast.timestamp,
    )

    forecast_location = harmonie.forecast_location

    if forecast_location == "Unknown":
        forecast_location = ecmwf.forecast_location

    return WeatherResponse(
        forecast_location=forecast_location,
        forecasts=merged_forecasts,
    )


def get_forecast(
    latitude: float,
    longitude: float,
) -> WeatherResponse:
    harmonie = get_harmonie_forecast(
        latitude,
        longitude,
    )

    ecmwf = get_ecmwf_forecast(
        latitude,
        longitude,
    )

    return merge_forecasts(
        harmonie,
        ecmwf,
    )
