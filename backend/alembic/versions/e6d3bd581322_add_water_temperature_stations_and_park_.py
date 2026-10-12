"""Add water temperature stations and park sensor link

Revision ID: e6d3bd581322
Revises: cae5c932c8e6
Create Date: 2026-10-12 14:46:05.956395

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6d3bd581322"
down_revision: Union[str, Sequence[str], None] = "cae5c932c8e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "water_temperature_stations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("source_station_id", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source",
            "source_station_id",
            name="uq_water_temperature_stations_source_station",
        ),
    )
    op.add_column(
        "parks", sa.Column("water_temperature_station_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f("ix_parks_water_temperature_station_id"),
        "parks",
        ["water_temperature_station_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_parks_water_temperature_station_id",
        "parks",
        "water_temperature_stations",
        ["water_temperature_station_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_parks_water_temperature_station_id",
        "parks",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_parks_water_temperature_station_id"), table_name="parks")
    op.drop_column("parks", "water_temperature_station_id")
    op.drop_table("water_temperature_stations")
