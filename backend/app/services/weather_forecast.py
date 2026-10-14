import logging

from app.models.weather import WeatherResponse
from app.services.ecmwf import get_ecmwf_forecast
from app.services.fmi_forecast import get_fmi_edited_forecast
from app.services.weather_errors import WeatherProviderError

logger = logging.getLogger(__name__)


def merge_forecasts(
    fmi: WeatherResponse,
    ecmwf: WeatherResponse,
) -> WeatherResponse:
    forecasts_by_timestamp = {
        forecast.timestamp: forecast for forecast in ecmwf.forecasts
    }

    for forecast in fmi.forecasts:
        forecasts_by_timestamp[forecast.timestamp] = forecast

    merged_forecasts = sorted(
        forecasts_by_timestamp.values(),
        key=lambda forecast: forecast.timestamp,
    )

    forecast_location = fmi.forecast_location

    if forecast_location == "Unknown":
        forecast_location = ecmwf.forecast_location

    return WeatherResponse(
        forecast_location=forecast_location,
        forecasts=merged_forecasts,
    )


def get_provider_forecasts(
    latitude: float,
    longitude: float,
) -> tuple[WeatherResponse, WeatherResponse]:
    responses = []

    for source, fetch in (
        ("fmi_edited", get_fmi_edited_forecast),
        ("ecmwf", get_ecmwf_forecast),
    ):
        try:
            weather = fetch(latitude, longitude)

            if not weather.forecasts:
                raise WeatherProviderError(
                    f"{source} returned no usable forecast points"
                )
        except WeatherProviderError:
            logger.warning(
                "Forecast provider unavailable: %s",
                source,
            )
            weather = WeatherResponse(
                forecast_location="Unknown",
                forecasts=[],
            )

        responses.append(weather)

    fmi, ecmwf = responses

    if not fmi.forecasts and not ecmwf.forecasts:
        raise WeatherProviderError("Both forecast providers are unavailable")

    return fmi, ecmwf


def get_forecast(
    latitude: float,
    longitude: float,
) -> WeatherResponse:
    fmi, ecmwf = get_provider_forecasts(
        latitude,
        longitude,
    )

    return merge_forecasts(fmi, ecmwf)
