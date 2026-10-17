import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from math import isfinite

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

FMI_EDITED_FIELD_MAP = {
    "Temperature": "temperature",
    "WindSpeedMS": "wind_speed",
    "HourlyMaximumGust": "wind_gust",
    "WindDirection": "wind_direction",
    "Precipitation1h": "precipitation",
    "PoP": "precipitation_probability",
    "TotalCloudCover": "cloudiness",
}


def get_fmi_edited_forecast(
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
            FMI_EDITED_FIELD_MAP,
            source="fmi_edited",
        )
    except (ET.ParseError, ValueError, KeyError, OverflowError) as exc:
        raise WeatherProviderError("FMI returned invalid forecast data") from exc

    if not weather.forecasts:
        raise WeatherProviderError("FMI returned no usable forecast points")

    return weather


def parse_forecast(
    xml_text: str,
    field_map: dict[str, str],
    source: str = "fmi_edited",
) -> WeatherResponse:
    root = ET.fromstring(xml_text)

    location_element = root.find(".//target:Location/gml:name", NAMESPACES)
    forecast_location = (
        location_element.text
        if location_element is not None and location_element.text
        else "Unknown"
    )

    field_elements = root.findall(
        ".//gmlcov:rangeType/swe:DataRecord/swe:field",
        NAMESPACES,
    )
    field_names = [element.attrib.get("name", "") for element in field_elements]

    required_fields = {
        name
        for name, mapped_name in field_map.items()
        if mapped_name != "precipitation_probability"
    }

    if (
        not field_names
        or any(not name for name in field_names)
        or len(field_names) != len(set(field_names))
        or not required_fields.issubset(field_names)
    ):
        raise ValueError("Invalid FMI forecast fields")

    positions_elements = root.findall(".//gmlcov:positions", NAMESPACES)
    values_elements = root.findall(".//gml:doubleOrNilReasonTupleList", NAMESPACES)

    if len(positions_elements) != 1 or len(values_elements) != 1:
        raise ValueError("Expected one FMI forecast coverage")

    position_values = (positions_elements[0].text or "").split()
    rows = [
        line.split()
        for line in (values_elements[0].text or "").splitlines()
        if line.strip()
    ]

    if not position_values or len(position_values) % 3:
        raise ValueError("Invalid FMI forecast positions")

    if len(rows) != len(position_values) // 3:
        raise ValueError("FMI forecast timestamp and row counts differ")

    if any(len(row) != len(field_names) for row in rows):
        raise ValueError("FMI forecast field and value counts differ")

    forecasts = []
    seen_timestamps = set()

    for index, row in enumerate(rows):
        position = [
            float(value) for value in position_values[index * 3 : index * 3 + 3]
        ]

        if not all(isfinite(value) for value in position):
            raise ValueError("Non-finite FMI forecast position")

        unix_timestamp = position[2]
        if not unix_timestamp.is_integer():
            raise ValueError("Invalid FMI forecast timestamp")

        timestamp = datetime.fromtimestamp(unix_timestamp, tz=UTC)

        if timestamp in seen_timestamps:
            raise ValueError("Duplicate FMI forecast timestamp")
        seen_timestamps.add(timestamp)

        raw_data = dict(zip(field_names, row, strict=True))
        values = {}
        missing_required_value = False

        for fmi_name, wakecast_name in field_map.items():
            raw_value = raw_data.get(fmi_name)

            if raw_value is None or raw_value == "NaN":
                if wakecast_name == "precipitation_probability":
                    values[wakecast_name] = None
                else:
                    missing_required_value = True
                continue

            value = float(raw_value)
            if not isfinite(value):
                raise ValueError(f"Non-finite FMI forecast value: {fmi_name}")

            values[wakecast_name] = value

        if missing_required_value:
            continue

        forecasts.append(
            WeatherForecast(
                timestamp=timestamp,
                source=source,
                **values,
            )
        )

    forecasts.sort(key=lambda forecast: forecast.timestamp)

    return WeatherResponse(
        forecast_location=forecast_location,
        forecasts=forecasts,
    )
