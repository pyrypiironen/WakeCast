import httpx

from app.models.water_temperature import (
    WaterTemperatureObservation,
    WaterTemperatureResponse,
)
from app.services.weather_errors import WeatherProviderError


UIRAS_URL = "https://iot.fvh.fi/opendata/uiras/uiras_latest.geojson"


def get_water_temperature(
    station_id: str,
) -> WaterTemperatureResponse:
    try:
        response = httpx.get(
            UIRAS_URL,
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise WeatherProviderError(
            "UiRaS request failed"
        ) from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise WeatherProviderError(
            "UiRaS returned invalid JSON"
        ) from exc

    return parse_water_temperature(
        data,
        station_id=station_id,
    )


def parse_water_temperature(
    data: dict,
    station_id: str,
) -> WaterTemperatureResponse:
    if not isinstance(data, dict):
        raise WeatherProviderError(
            "UiRaS returned an invalid response"
        )

    if data.get("type") != "FeatureCollection":
        raise WeatherProviderError(
            "UiRaS returned an invalid GeoJSON collection"
        )

    features = data.get("features")

    if not isinstance(features, list):
        raise WeatherProviderError(
            "UiRaS returned an invalid sensor list"
        )

    for feature in features:
        if not isinstance(feature, dict):
            raise WeatherProviderError(
                "UiRaS returned an invalid sensor entry"
            )

        if feature.get("id") != station_id:
            continue

        try:
            properties = feature["properties"]
            geometry = feature["geometry"]

            if not isinstance(properties, dict):
                raise ValueError("Invalid sensor properties")

            if not isinstance(geometry, dict):
                raise ValueError("Invalid sensor geometry")

            coordinates = geometry.get("coordinates")

            if (
                geometry.get("type") != "Point"
                or not isinstance(coordinates, list)
                or len(coordinates) < 2
            ):
                raise ValueError("Invalid sensor coordinates")

            observations = []
            measurement = properties.get("measurement")

            if measurement is not None:
                if not isinstance(measurement, dict):
                    raise ValueError("Invalid measurement")

                temperature = measurement.get("temp_water")

                if temperature is not None:
                    observations.append(
                        WaterTemperatureObservation(
                            timestamp=measurement["time"],
                            water_temperature=temperature,
                        )
                    )

            return WaterTemperatureResponse(
                source="uiras",
                source_station_id=station_id,
                observation_location=properties["name"],
                longitude=coordinates[0],
                latitude=coordinates[1],
                observations=observations,
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise WeatherProviderError(
                "UiRaS returned invalid sensor data"
            ) from exc

    raise WeatherProviderError(
        "Requested water temperature sensor was not found in UiRaS"
    )


