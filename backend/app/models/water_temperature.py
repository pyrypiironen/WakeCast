from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

MAX_WATER_TEMPERATURE_CLOCK_SKEW = timedelta(minutes=5)


class WaterTemperatureObservation(BaseModel):
    timestamp: AwareDatetime
    water_temperature: float = Field(allow_inf_nan=False)

    @field_validator("timestamp")
    @classmethod
    def reject_future_timestamp(cls, value: datetime) -> datetime:
        latest_allowed = datetime.now(timezone.utc) + MAX_WATER_TEMPERATURE_CLOCK_SKEW

        if value > latest_allowed:
            raise ValueError("Water temperature timestamp is too far in the future")

        return value


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
