"""Add forecast location

Revision ID: a6866898784f
Revises: 20c278471a60
Create Date: 2026-08-19 18:11:42.264031

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a6866898784f"
down_revision: Union[str, Sequence[str], None] = "20c278471a60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "weather_forecasts",
        sa.Column(
            "forecast_location",
            sa.String(length=100),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE weather_forecasts
        SET forecast_location = 'Karhusaari'
        WHERE forecast_location IS NULL
        """
    )

    op.alter_column(
        "weather_forecasts",
        "forecast_location",
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column(
        "weather_forecasts",
        "forecast_location",
    )
