"""Privileged membership lookup for cross-org enumeration (ADR-0011).

Adds a ``SECURITY DEFINER`` function that lists a user's org memberships while
bypassing RLS on ``memberships``. This is the one privileged path that lets an
identity-only endpoint (``GET /auth/me``) enumerate a user's workspaces *before*
any tenant is bound — a normal RLS-scoped read fails closed (no ``app.tenant_id``
is set, so the policy hides every row).

The function is owned by the migration role (table owner / superuser), so its
definer context bypasses RLS; ``EXECUTE`` is granted to ``flow_app``. ``search_path``
is pinned so the definer-context body can't be hijacked by a caller's path.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION app_user_memberships(p_user_id text)
            RETURNS TABLE (org_id uuid, org_name text, role text)
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = pg_catalog, public
        AS $$
            SELECT m.tenant_id, o.name, m.role
            FROM memberships m
            JOIN orgs o ON o.id = m.tenant_id
            WHERE m.user_id = p_user_id
        $$
        """
    )
    op.execute("GRANT EXECUTE ON FUNCTION app_user_memberships(text) TO flow_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS app_user_memberships(text)")
