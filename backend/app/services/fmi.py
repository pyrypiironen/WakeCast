from datetime import datetime, timezone
import xml.etree.ElementTree as ET

import httpx

from app.models.weather import WeatherForecast, WeatherResponse


FMI_URL = "https://opendata.fmi.fi/wfs"
OPEN_METEO_ECMWF_URL = "https://api.open-meteo.com/v1/ecmwf"

FMI_FORECAST_QUERY = (
    "fmi::forecast::edited::weather::scandinavia::point::multipointcoverage"
)


NAMESPACES = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gmlcov": "http://www.opengis.net/gmlcov/1.0",
    "swe": "http://www.opengis.net/swe/2.0",
    "target": "http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1",
}


#FIELD_MAP = {
#    "Temperature": "temperature",
#    "WindSpeedMS": "wind_speed",
#    "HourlyMaximumGust": "wind_gust",
#    "WindDirection": "wind_direction",
#    "Precipitation1h": "precipitation",
#    "PoP": "precipitation_probability",
#    "TotalCloudCover": "cloudiness",
#}


HARMONIE_FIELD_MAP = {
    "Temperature": "temperature",
    "WindSpeedMS": "wind_speed",
    "HourlyMaximumGust": "wind_gust",
    "WindDirection": "wind_direction",
    "Precipitation1h": "precipitation",
    "PoP": "precipitation_probability",
    "TotalCloudCover": "cloudiness",
}


ECMWF_FIELD_MAP = {
    "temperature_2m": "temperature",
    "wind_speed_10m": "wind_speed",
    "wind_gusts_10m": "wind_gust",
    "wind_direction_10m": "wind_direction",
    "precipitation": "precipitation",
    "cloud_cover": "cloudiness",
}


def get_harmonie_forecast(
    latitude: float,
    longitude: float,
) -> WeatherResponse:
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

    return parse_forecast(
    response.text,
    HARMONIE_FIELD_MAP,
    source="harmonie",
)


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


def merge_forecasts(
    harmonie: WeatherResponse,
    ecmwf: WeatherResponse,
) -> WeatherResponse:
    forecasts_by_timestamp = {
        forecast.timestamp: forecast
        for forecast in ecmwf.forecasts
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


def parse_forecast(
    xml_text: str,
    field_map: dict[str, str],
    source: str = "harmonie",
) -> WeatherResponse:
    root = ET.fromstring(xml_text)

    location_element = root.find(
        ".//target:Location/gml:name",
        NAMESPACES,
    )

    if location_element is None or location_element.text is None:
        forecast_location = "Unknown"
    else:
        forecast_location = location_element.text

    field_elements = root.findall(
        ".//gmlcov:rangeType/swe:DataRecord/swe:field",
        NAMESPACES,
    )

    field_names = [
        element.attrib["name"]
        for element in field_elements
    ]

    positions_element = root.find(
        ".//gmlcov:positions",
        NAMESPACES,
    )

    values_element = root.find(
        ".//gml:doubleOrNilReasonTupleList",
        NAMESPACES,
    )

    if (
        positions_element is None
        or positions_element.text is None
        or values_element is None
        or values_element.text is None
    ):
        return WeatherResponse(
            forecast_location=forecast_location,
            forecasts=[],
        )

    position_values = positions_element.text.split()

    timestamps = []

    for index in range(2, len(position_values), 3):
        unix_timestamp = int(float(position_values[index]))

        timestamps.append(
            datetime.fromtimestamp(
                unix_timestamp,
                tz=timezone.utc,
            )
        )

    rows = [
        line.split()
        for line in values_element.text.strip().splitlines()
        if line.strip()
    ]

    forecasts = []

    for timestamp, row in zip(timestamps, rows):
        raw_data = dict(zip(field_names, row))

        values = {}

        for fmi_name, wakecast_name in field_map.items():
            raw_value = raw_data.get(fmi_name)

            if raw_value is None or raw_value == "NaN":
                break

            values[wakecast_name] = float(raw_value)

        else:
            forecasts.append(
                WeatherForecast(
                    timestamp=timestamp,
                    source=source,
                    **values,
                )
            )

    return WeatherResponse(
        forecast_location=forecast_location,
        forecasts=forecasts,
    )


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

