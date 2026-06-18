"""Initial schema: workflows, outbox_messages, RLS.

Revision ID: 0001
Revises:
Create Date: 2026-06-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # App role used by the service — policies grant access to this role.
    # CREATE ROLE is not transactional; skipped if it already exists.
    op.execute("DO $$ BEGIN CREATE ROLE flow_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$")

    # -------------------------------------------------------------------------
    # workflows
    # -------------------------------------------------------------------------
    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("graph", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workflows_tenant_id", "workflows", ["tenant_id"])

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON workflows TO flow_app")
    op.execute("ALTER TABLE workflows ENABLE ROW LEVEL SECURITY")
    # FORCE RLS so even the table owner cannot bypass it — fail-closed (ADR-0011).
    op.execute("ALTER TABLE workflows FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON workflows
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )

    # -------------------------------------------------------------------------
    # outbox_messages — infrastructure table, no tenant isolation needed.
    # -------------------------------------------------------------------------
    op.create_table(
        "outbox_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(255), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_outbox_messages_published", "outbox_messages", ["published"])
    op.execute("GRANT SELECT, INSERT, UPDATE ON outbox_messages TO flow_app")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON workflows")
    op.drop_table("outbox_messages")
    op.drop_table("workflows")
