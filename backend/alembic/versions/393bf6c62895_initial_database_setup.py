"""Initial database setup

Revision ID: 393bf6c62895
Revises:
Create Date: 2026-08-18 15:57:16.490203

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "393bf6c62895"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
