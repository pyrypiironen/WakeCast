from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field


class WaterTemperatureObservation(BaseModel):
    timestamp: AwareDatetime
    water_temperature: float = Field(allow_inf_nan=False)


class WaterTemperatureResponse(BaseModel):
    source: Literal["uiras"]
    source_station_id: str
    observation_location: str

    latitude: float
    longitude: float

    observations: list[WaterTemperatureObservation]


class ParkWaterTemperatureResponse(BaseModel):
    source: str
    source_station_id: str
    observation_location: str

    latitude: float
    longitude: float

    timestamp: AwareDatetime
    fetched_at: AwareDatetime

    water_temperature: float = Field(allow_inf_nan=False)
    is_stale: bool
