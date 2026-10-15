import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from math import isfinite

import httpx

from app.models.weather import (
    WeatherObservation,
    WeatherObservationResponse,
)

FMI_URL = "https://opendata.fmi.fi/wfs"
FMI_OBSERVATION_QUERY = "fmi::observations::weather::multipointcoverage"

OBSERVATION_FIELD_MAP = {
    "temperature": "temperature",
    "windspeedms": "wind_speed",
    "windgust": "wind_gust",
    "winddirection": "wind_direction",
    "precipitation1h": "precipitation",
    "totalcloudcover": "cloudiness",
}

NAMESPACES = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gmlcov": "http://www.opengis.net/gmlcov/1.0",
    "swe": "http://www.opengis.net/swe/2.0",
    "target": "http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1",
}


def get_observations(
    station_id: int,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> WeatherObservationResponse:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "storedquery_id": FMI_OBSERVATION_QUERY,
        "fmisid": station_id,
        "parameters": ",".join(OBSERVATION_FIELD_MAP.keys()),
    }

    if start_time is not None:
        params["starttime"] = start_time.astimezone(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

    if end_time is not None:
        params["endtime"] = end_time.astimezone(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

    response = httpx.get(
        FMI_URL,
        params=params,
        timeout=30.0,
    )

    response.raise_for_status()

    return parse_observations(
        response.text,
        station_id=station_id,
    )


def parse_observations(
    xml_text: str,
    station_id: int,
) -> WeatherObservationResponse:
    root = ET.fromstring(xml_text)

    location_element = root.find(".//target:Location/gml:name", NAMESPACES)
    observation_location = (
        location_element.text
        if location_element is not None and location_element.text
        else "Unknown"
    )

    field_elements = root.findall(
        ".//gmlcov:rangeType/swe:DataRecord/swe:field",
        NAMESPACES,
    )
    field_names = [element.attrib.get("name", "") for element in field_elements]

    if (
        not field_names
        or any(not name for name in field_names)
        or len(field_names) != len(set(field_names))
        or not set(OBSERVATION_FIELD_MAP).issubset(field_names)
    ):
        raise ValueError("Invalid FMI observation fields")

    positions_elements = root.findall(".//gmlcov:positions", NAMESPACES)
    values_elements = root.findall(".//gml:doubleOrNilReasonTupleList", NAMESPACES)

    if len(positions_elements) != 1 or len(values_elements) != 1:
        raise ValueError("Expected one FMI observation coverage")

    position_values = (positions_elements[0].text or "").split()
    rows = [
        line.split()
        for line in (values_elements[0].text or "").splitlines()
        if line.strip()
    ]

    if not position_values or len(position_values) % 3:
        raise ValueError("Invalid FMI observation positions")

    if len(rows) != len(position_values) // 3:
        raise ValueError("FMI observation timestamp and row counts differ")

    if any(len(row) != len(field_names) for row in rows):
        raise ValueError("FMI observation field and value counts differ")

    observations = []
    seen_timestamps = set()

    for index, row in enumerate(rows):
        position = [
            float(value) for value in position_values[index * 3 : index * 3 + 3]
        ]

        if not all(isfinite(value) for value in position):
            raise ValueError("Non-finite FMI observation position")

        unix_timestamp = position[2]
        if not unix_timestamp.is_integer():
            raise ValueError("Invalid FMI observation timestamp")

        timestamp = datetime.fromtimestamp(unix_timestamp, tz=timezone.utc)

        if timestamp in seen_timestamps:
            raise ValueError("Duplicate FMI observation timestamp")
        seen_timestamps.add(timestamp)

        raw_data = dict(zip(field_names, row, strict=True))
        values = {}

        for fmi_name, wakecast_name in OBSERVATION_FIELD_MAP.items():
            raw_value = raw_data[fmi_name]

            if raw_value == "NaN":
                values[wakecast_name] = None
                continue

            value = float(raw_value)
            if not isfinite(value):
                raise ValueError(f"Non-finite FMI observation value: {fmi_name}")

            if wakecast_name == "cloudiness":
                value = min(value, 8.0) / 8.0 * 100.0

            values[wakecast_name] = value

        if all(value is None for value in values.values()):
            continue

        observations.append(WeatherObservation(timestamp=timestamp, **values))

    observations.sort(key=lambda observation: observation.timestamp)

    return WeatherObservationResponse(
        observation_location=observation_location,
        observation_station_id=station_id,
        observations=observations,
    )


def get_observation_resolution_minutes(
    weather: WeatherObservationResponse,
) -> int | None:
    if len(weather.observations) < 2:
        return None

    intervals = [
        int((current.timestamp - previous.timestamp).total_seconds() // 60)
        for previous, current in zip(
            weather.observations,
            weather.observations[1:],
        )
    ]

    if not intervals:
        return None

    return min(intervals)
