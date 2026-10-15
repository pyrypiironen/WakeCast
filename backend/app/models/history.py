from pydantic import AwareDatetime, BaseModel, ConfigDict


class WeatherObservationHistoryPoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    timestamp: AwareDatetime
    fetched_at: AwareDatetime
    temperature: float | None = None
    wind_speed: float | None = None
    wind_gust: float | None = None
    wind_direction: float | None = None
    precipitation: float | None = None
    cloudiness: float | None = None
    source: str
    observation_location: str
    resolution_minutes: int | None = None
    is_aggregated: bool


class ParkWeatherObservationHistoryResponse(BaseModel):
    station_name: str
    source: str
    source_station_id: int
    timezone: str
    observations: list[WeatherObservationHistoryPoint]


class WaterTemperatureHistoryPoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    timestamp: AwareDatetime
    fetched_at: AwareDatetime
    water_temperature: float


class ParkWaterTemperatureHistoryResponse(BaseModel):
    observation_location: str
    source: str
    source_station_id: str
    latitude: float
    longitude: float
    timezone: str
    observations: list[WaterTemperatureHistoryPoint]
    preceding_observation: WaterTemperatureHistoryPoint | None = None
