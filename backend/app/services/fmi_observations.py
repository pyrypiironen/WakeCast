from datetime import datetime, timezone
import xml.etree.ElementTree as ET

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
        params["starttime"] = start_time.isoformat()

    if end_time is not None:
        params["endtime"] = end_time.isoformat()

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

    location_element = root.find(
        ".//target:Location/gml:name",
        NAMESPACES,
    )

    if location_element is None or location_element.text is None:
        observation_location = "Unknown"
    else:
        observation_location = location_element.text

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
        return WeatherObservationResponse(
            observation_location=observation_location,
            observation_station_id=station_id,
            observations=[],
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

    observations = []

    for timestamp, row in zip(timestamps, rows):
        raw_data = dict(zip(field_names, row))

        values = {}

        for fmi_name, wakecast_name in OBSERVATION_FIELD_MAP.items():
            raw_value = raw_data.get(fmi_name)

            if raw_value is None or raw_value == "NaN":
                values[wakecast_name] = None
            else:
                value = float(raw_value)

                if wakecast_name == "cloudiness":
                    value = min(value, 8.0) / 8.0 * 100.0

                values[wakecast_name] = value

        observations.append(
            WeatherObservation(
                timestamp=timestamp,
                **values,
            )
        )

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
