from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.park_db import ParkDB


class WeatherForecastDB(Base):
    __tablename__ = "weather_forecasts"

    id: Mapped[int] = mapped_column(primary_key=True)

    park_id: Mapped[int] = mapped_column(
        ForeignKey("parks.id"),
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    forecast_location: Mapped[str] = mapped_column(String(100))
    temperature: Mapped[float] = mapped_column(Float)
    wind_speed: Mapped[float] = mapped_column(Float)
    wind_gust: Mapped[float] = mapped_column(Float)
    wind_direction: Mapped[float] = mapped_column(Float)

    precipitation: Mapped[float] = mapped_column(Float)
    precipitation_probability: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    cloudiness: Mapped[float] = mapped_column(Float)

    source: Mapped[str] = mapped_column(String(20))

    park: Mapped["ParkDB"] = relationship()


class WeatherStationDB(Base):
    __tablename__ = "weather_stations"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )

    source: Mapped[str] = mapped_column(String(20))
    source_station_id: Mapped[int] = mapped_column(
        unique=True,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(default=True)


class WeatherObservationDB(Base):
    __tablename__ = "weather_observations"
    __table_args__ = (
        UniqueConstraint(
            "weather_station_id",
            "timestamp",
            name="uq_weather_observations_station_timestamp",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    observation_location: Mapped[str] = mapped_column(String(100))
    weather_station_id: Mapped[int] = mapped_column(
        ForeignKey("weather_stations.id"),
        index=True,
    )

    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_gust: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_direction: Mapped[float | None] = mapped_column(Float, nullable=True)

    precipitation: Mapped[float | None] = mapped_column(Float, nullable=True)
    cloudiness: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_temperature: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    resolution_minutes: Mapped[int | None] = mapped_column(
        nullable=True,
    )
    is_aggregated: Mapped[bool] = mapped_column(
        default=False,
    )

    source: Mapped[str] = mapped_column(String(20))
    weather_station: Mapped["WeatherStationDB"] = relationship()