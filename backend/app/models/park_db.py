
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.weather_db import WeatherStationDB


class ParkDB(Base):
    __tablename__ = "parks"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    city: Mapped[str] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(100))

    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)

    water_type: Mapped[str] = mapped_column(String(20))

    website_url: Mapped[str] = mapped_column(String(500))

    timezone: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    observation_station_id: Mapped[int | None] = mapped_column(
        ForeignKey("weather_stations.id"),
        nullable=True,
        index=True,
    )

    observation_station: Mapped[WeatherStationDB | None] = relationship(
        "WeatherStationDB",
        foreign_keys=[observation_station_id],
    )

    cables: Mapped[list[CableDB]] = relationship(
        back_populates="park",
        cascade="all, delete-orphan",
    )


class CableDB(Base):
    __tablename__ = "cables"

    id: Mapped[int] = mapped_column(primary_key=True)

    park_id: Mapped[int] = mapped_column(
        ForeignKey("parks.id"),
        index=True,
    )

    name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    booking_url: Mapped[str] = mapped_column(String(500))

    park: Mapped[ParkDB] = relationship(
        back_populates="cables",
    )
