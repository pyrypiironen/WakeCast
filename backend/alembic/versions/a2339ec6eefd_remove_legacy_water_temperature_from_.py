"""Remove legacy water temperature from weather observations

Revision ID: a2339ec6eefd
Revises: 716230ed55bc
Create Date: 2026-10-12 17:13:41.571936

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2339ec6eefd"
down_revision: str | Sequence[str] | None = "716230ed55bc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("weather_observations", "water_temperature")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "weather_observations",
        sa.Column(
            "water_temperature",
            sa.DOUBLE_PRECISION(precision=53),
            autoincrement=False,
            nullable=True,
        ),
    )
