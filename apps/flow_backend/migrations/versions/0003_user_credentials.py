"""Email/password credentials on users.

Replaces external-IdP identity (ADR-0011 / Cognito) with local credentials:
adds users.password_hash and makes email a required, unique login key.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default lets the column land NOT NULL even if rows exist, then drop
    # it so future inserts must supply a real hash.
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=False, server_default=""))
    op.alter_column("users", "password_hash", server_default=None)
    op.alter_column("users", "email", existing_type=sa.Text(), nullable=False)
    op.create_unique_constraint("uq_users_email", "users", ["email"])


def downgrade() -> None:
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.alter_column("users", "email", existing_type=sa.Text(), nullable=True)
    op.drop_column("users", "password_hash")
