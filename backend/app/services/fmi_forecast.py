import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from app.models.weather import WeatherForecast, WeatherResponse
from app.services.weather_errors import WeatherProviderError

FMI_URL = "https://opendata.fmi.fi/wfs"

FMI_FORECAST_QUERY = (
    "fmi::forecast::edited::weather::scandinavia::point::multipointcoverage"
)

NAMESPACES = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gmlcov": "http://www.opengis.net/gmlcov/1.0",
    "swe": "http://www.opengis.net/swe/2.0",
    "target": "http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1",
}

HARMONIE_FIELD_MAP = {
    "Temperature": "temperature",
    "WindSpeedMS": "wind_speed",
    "HourlyMaximumGust": "wind_gust",
    "WindDirection": "wind_direction",
    "Precipitation1h": "precipitation",
    "PoP": "precipitation_probability",
    "TotalCloudCover": "cloudiness",
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

    try:
        response = httpx.get(
            FMI_URL,
            params=params,
            timeout=10.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise WeatherProviderError("FMI forecast request failed") from exc

    try:
        weather = parse_forecast(
            response.text,
            HARMONIE_FIELD_MAP,
            source="harmonie",
        )
    except (ET.ParseError, ValueError, KeyError, OverflowError) as exc:
        raise WeatherProviderError("FMI returned invalid forecast data") from exc

    if not weather.forecasts:
        raise WeatherProviderError("FMI returned no usable forecast points")

    return weather


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

    field_names = [element.attrib["name"] for element in field_elements]

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
                if wakecast_name == "precipitation_probability":
                    values[wakecast_name] = None
                    continue

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
