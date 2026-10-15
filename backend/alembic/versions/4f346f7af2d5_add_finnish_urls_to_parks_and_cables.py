"""add Finnish URLs to parks and cables

Revision ID: 4f346f7af2d5
Revises: a2339ec6eefd
Create Date: 2026-10-15 14:29:15.571340

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4f346f7af2d5"
down_revision: Union[str, Sequence[str], None] = "a2339ec6eefd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add optional Finnish URLs."""
    op.add_column(
        "parks",
        sa.Column(
            "website_url_fi",
            sa.String(length=500),
            nullable=True,
        ),
    )

    op.add_column(
        "cables",
        sa.Column(
            "booking_url_fi",
            sa.String(length=500),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove optional Finnish URLs."""
    op.drop_column("cables", "booking_url_fi")
    op.drop_column("parks", "website_url_fi")
