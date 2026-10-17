"""Add water temperature observations

Revision ID: 716230ed55bc
Revises: e6d3bd581322
Create Date: 2026-10-12 15:03:18.222368

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "716230ed55bc"
down_revision: str | Sequence[str] | None = "e6d3bd581322"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "water_temperature_observations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("water_temperature_station_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("water_temperature", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(
            ["water_temperature_station_id"],
            ["water_temperature_stations.id"],
            name="fk_water_temperature_observations_station_id",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "water_temperature_station_id",
            "timestamp",
            name="uq_water_temperature_observations_station_timestamp",
        ),
    )
    op.create_index(
        op.f("ix_water_temperature_observations_timestamp"),
        "water_temperature_observations",
        ["timestamp"],
        unique=False,
    )
    op.create_index(
        op.f("ix_water_temperature_observations_water_temperature_station_id"),
        "water_temperature_observations",
        ["water_temperature_station_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_water_temperature_observations_water_temperature_station_id"),
        table_name="water_temperature_observations",
    )
    op.drop_index(
        op.f("ix_water_temperature_observations_timestamp"),
        table_name="water_temperature_observations",
    )
    op.drop_table("water_temperature_observations")
