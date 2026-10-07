from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
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


class WeatherObservationDB(Base):
    __tablename__ = "weather_observations"

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

    observation_location: Mapped[str] = mapped_column(String(100))
    observation_station_id: Mapped[int] = mapped_column()

    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_gust: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_direction: Mapped[float | None] = mapped_column(Float, nullable=True)

    precipitation: Mapped[float | None] = mapped_column(Float, nullable=True)
    cloudiness: Mapped[float | None] = mapped_column(Float, nullable=True)

    source: Mapped[str] = mapped_column(String(20))

    park: Mapped["ParkDB"] = relationship()
