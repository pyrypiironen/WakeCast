import httpx


FMI_URL = "https://opendata.fmi.fi/wfs"

FMI_FORECAST_QUERY = (
    "fmi::forecast::harmonie::surface::point::timevaluepair"
)


def get_forecast(latitude: float, longitude: float):
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "storedquery_id": FMI_FORECAST_QUERY,
        "latlon": f"{latitude},{longitude}",
    }

    response = httpx.get(
        FMI_URL,
        params=params,
        timeout=10.0,
    )

    response.raise_for_status()

    return response.text