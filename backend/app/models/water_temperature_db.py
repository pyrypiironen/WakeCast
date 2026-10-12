from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WaterTemperatureStationDB(Base):
    __tablename__ = "water_temperature_stations"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "source_station_id",
            name="uq_water_temperature_stations_source_station",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(100))

    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)

    source: Mapped[str] = mapped_column(String(20))
    source_station_id: Mapped[str] = mapped_column(String(100))

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )


class WaterTemperatureObservationDB(Base):
    __tablename__ = "water_temperature_observations"
    __table_args__ = (
        UniqueConstraint(
            "water_temperature_station_id",
            "timestamp",
            name="uq_water_temperature_observations_station_timestamp",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    water_temperature_station_id: Mapped[int] = mapped_column(
        ForeignKey(
            "water_temperature_stations.id",
            name="fk_water_temperature_observations_station_id",
        ),
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    water_temperature: Mapped[float] = mapped_column(Float)

    station: Mapped[WaterTemperatureStationDB] = relationship(
        "WaterTemperatureStationDB",
    )

