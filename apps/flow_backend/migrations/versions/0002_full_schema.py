"""Full schema: all remaining v1 tables, RLS, partitions, and immutability.

Adds: orgs, users, memberships, workflow_drafts, workflow_versions (immutable),
workflow_routing, node_usages, node_type_manifests, connections,
trigger_subscriptions, processed_events, dead_letter_events,
wait_subscriptions (v1-deferred), and time-range-partitioned runs / run_events /
node_runs / node_outputs with initial monthly partitions for 2026.

Also adds the missing `archived` column to workflows and wires
workflows.tenant_id → orgs.id as a FK now that orgs exists.

ADR-0011 (tenant isolation / RLS), ADR-0007 (immutable versions),
ADR-0002/0004/0005 (event-sourced read model), ADR-0008 (connections).

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Monthly partition windows to pre-create (year, month).
_PARTITIONS = [(2026, 6), (2026, 7), (2026, 8), (2026, 9)]


def _rls(table: str) -> None:
    """Enable fail-closed RLS on a tenant-scoped table."""
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. Patch workflows (PR-1 skeleton was missing archived)
    # -------------------------------------------------------------------------
    op.add_column(
        "workflows",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )

    # -------------------------------------------------------------------------
    # 2. Identity & tenancy  (ADR-0011)
    # -------------------------------------------------------------------------
    op.create_table(
        "orgs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON orgs TO flow_app")
    # No RLS — orgs are looked up during auth before tenant context is set.

    op.create_table(
        "users",
        sa.Column("id", sa.Text(), primary_key=True),  # Cognito sub
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON users TO flow_app")
    # No RLS — user profiles are global (identity of record is Cognito).

    op.create_table(
        "memberships",
        sa.Column(
            "user_id",
            sa.Text(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "tenant_id"),
        sa.CheckConstraint(
            "role IN ('admin', 'editor', 'viewer')",
            name="ck_memberships_role",
        ),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO flow_app")
    _rls("memberships")

    # Wire existing workflows.tenant_id → orgs.id (org always created first).
    op.create_foreign_key(
        "fk_workflows_tenant_id",
        "workflows",
        "orgs",
        ["tenant_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # -------------------------------------------------------------------------
    # 3. Authoring: versions (immutable), drafts, routing, node_usages
    #    Create workflow_versions BEFORE workflow_drafts (draft refs version).
    # -------------------------------------------------------------------------
    op.create_table(
        "workflow_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column("content_hash", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("validation", postgresql.JSONB(), nullable=True),
        sa.Column("published_by", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "workflow_id", "version_number", name="uq_workflow_versions_wf_vnum"
        ),
    )
    op.create_index(
        "ix_workflow_versions_workflow_id", "workflow_versions", ["workflow_id"]
    )
    op.execute("GRANT SELECT, INSERT ON workflow_versions TO flow_app")
    # Append-only: revoke mutation permissions (ADR-0007).
    op.execute("REVOKE UPDATE, DELETE ON workflow_versions FROM flow_app")
    _rls("workflow_versions")

    # DB-trigger defense-in-depth — blocks even superuser mutations.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION _prevent_wv_mutation()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'workflow_versions is append-only; mutations are not permitted';
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER no_update_workflow_versions
            BEFORE UPDATE ON workflow_versions
            FOR EACH ROW EXECUTE FUNCTION _prevent_wv_mutation()
        """
    )
    op.execute(
        """
        CREATE TRIGGER no_delete_workflow_versions
            BEFORE DELETE ON workflow_versions
            FOR EACH ROW EXECUTE FUNCTION _prevent_wv_mutation()
        """
    )

    op.create_table(
        "workflow_drafts",
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "content", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
        sa.Column("content_hash", sa.Text(), nullable=True),
        sa.Column(
            "base_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "draft_revision", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON workflow_drafts TO flow_app")
    _rls("workflow_drafts")

    op.create_table(
        "workflow_routing",
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "live_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_versions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "canary_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_versions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "canary_weight", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("sticky_key_expr", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "canary_weight >= 0 AND canary_weight <= 100",
            name="ck_routing_canary_weight",
        ),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON workflow_routing TO flow_app")
    _rls("workflow_routing")

    op.create_table(
        "node_usages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=True),  # NULL = draft
        sa.Column("type_id", sa.Text(), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("node_path", sa.Text(), nullable=False),
    )
    op.create_index("ix_node_usages_workflow_id", "node_usages", ["workflow_id"])
    op.create_index("ix_node_usages_type_id", "node_usages", ["type_id"])
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON node_usages TO flow_app")
    _rls("node_usages")

    # -------------------------------------------------------------------------
    # 4. Node-type registry (ADR-0009) — GLOBAL, no org scope, no RLS
    # -------------------------------------------------------------------------
    op.create_table(
        "node_type_manifests",
        sa.Column("type_id", sa.Text(), primary_key=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column(
            "display", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
        sa.Column(
            "config_schema", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
        sa.Column(
            "output_spec", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
        sa.Column("storage_lane", sa.Text(), nullable=False),
        sa.Column(
            "retry_safe", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.CheckConstraint(
            "storage_lane IN ('postgres', 's3')",
            name="ck_node_type_storage_lane",
        ),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON node_type_manifests TO flow_app")

    # -------------------------------------------------------------------------
    # 5. Connections & secrets (ADR-0008)
    # -------------------------------------------------------------------------
    op.create_table(
        "connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("secret_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("wrapped_data_key", sa.LargeBinary(), nullable=True),
        sa.Column("oauth", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('connected', 'error', 'available')",
            name="ck_connections_status",
        ),
    )
    op.create_index("ix_connections_tenant_id", "connections", ["tenant_id"])
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON connections TO flow_app")
    _rls("connections")

    # -------------------------------------------------------------------------
    # 6. Triggers & events (ADR-0006)
    # -------------------------------------------------------------------------
    op.create_table(
        "trigger_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("filter", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_trigger_subs_source_event",
        "trigger_subscriptions",
        ["source", "event_type"],
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON trigger_subscriptions TO flow_app"
    )
    _rls("trigger_subscriptions")

    op.create_table(
        "processed_events",
        sa.Column("event_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("GRANT SELECT, INSERT ON processed_events TO flow_app")
    # No RLS — accessed by the ingestion role before org context is set.

    op.create_table(
        "dead_letter_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column(
            "payload", postgresql.JSONB(), nullable=False, server_default="{}"
        ),
        sa.Column("last_error", postgresql.JSONB(), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_dead_letter_tenant_id", "dead_letter_events", ["tenant_id"]
    )
    op.execute("GRANT SELECT, INSERT ON dead_letter_events TO flow_app")
    _rls("dead_letter_events")

    # wait_subscriptions is v1-deferred (Scope #19) but the table exists.
    op.create_table(
        "wait_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("execution_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("correlation_key", sa.Text(), nullable=False),
        sa.Column("match_filter", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_wait_subs_event_key",
        "wait_subscriptions",
        ["event_type", "correlation_key"],
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON wait_subscriptions TO flow_app"
    )
    _rls("wait_subscriptions")

    # -------------------------------------------------------------------------
    # 7. Event-sourced read model — time-range partitioned (ADR-0002, 0004, 0005)
    #
    # PostgreSQL requires the partition key to be part of every unique/PK
    # constraint on a partitioned table.  FKs across partitioned tables are
    # application-enforced; Postgres does not support them across partition
    # boundaries without including the partition key in the referencing column
    # set, which would force callers to carry started_at everywhere.
    # -------------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE runs (
            id               UUID        NOT NULL,
            tenant_id        UUID        NOT NULL,
            workflow_id      UUID        NOT NULL,
            version_id       UUID,
            version_number   INT,
            status           TEXT        NOT NULL
                CHECK (status IN ('running','waiting','success','failed')),
            trigger_kind     TEXT        NOT NULL,
            temporal_run_id  TEXT,
            retry_of         UUID,
            started_at       TIMESTAMPTZ NOT NULL,
            finished_at      TIMESTAMPTZ,
            duration_ms      BIGINT,
            PRIMARY KEY (id, started_at)
        ) PARTITION BY RANGE (started_at)
        """
    )
    op.execute(
        "CREATE INDEX ix_runs_tenant_status ON runs (tenant_id, status)"
    )
    op.execute(
        "CREATE INDEX ix_runs_workflow_started ON runs (workflow_id, started_at DESC)"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON runs TO flow_app")
    op.execute("ALTER TABLE runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE runs FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON runs
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )

    op.execute(
        """
        CREATE TABLE run_events (
            run_id      UUID        NOT NULL,
            tenant_id   UUID        NOT NULL,
            node_path   TEXT        NOT NULL,
            seq         BIGINT      NOT NULL,
            transition  TEXT        NOT NULL,
            ts          TIMESTAMPTZ NOT NULL,
            payload     JSONB,
            PRIMARY KEY (run_id, node_path, seq, ts)
        ) PARTITION BY RANGE (ts)
        """
    )
    op.execute("CREATE INDEX ix_run_events_run_id ON run_events (run_id)")
    op.execute("GRANT SELECT, INSERT ON run_events TO flow_app")
    op.execute("ALTER TABLE run_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE run_events FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON run_events
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )

    op.execute(
        """
        CREATE TABLE node_runs (
            id            UUID        NOT NULL,
            run_id        UUID        NOT NULL,
            tenant_id     UUID        NOT NULL,
            node_path     TEXT        NOT NULL,
            node_type     TEXT        NOT NULL,
            status        TEXT        NOT NULL
                CHECK (status IN ('running','waiting','succeeded','failed','cancelled','skipped')),
            input_ref     JSONB,
            output_ref    JSONB,
            error         JSONB,
            taken_edge_id TEXT,
            waiting_for   JSONB,
            started_at    TIMESTAMPTZ NOT NULL,
            finished_at   TIMESTAMPTZ,
            PRIMARY KEY (id, started_at),
            UNIQUE (run_id, node_path, started_at)
        ) PARTITION BY RANGE (started_at)
        """
    )
    op.execute("CREATE INDEX ix_node_runs_run_id ON node_runs (run_id)")
    op.execute("GRANT SELECT, INSERT, UPDATE ON node_runs TO flow_app")
    op.execute("ALTER TABLE node_runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE node_runs FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON node_runs
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )

    # node_outputs has no natural timestamp in the data model; created_at is
    # added here solely to serve as the partition key.
    op.execute(
        """
        CREATE TABLE node_outputs (
            run_id      UUID        NOT NULL,
            node_path   TEXT        NOT NULL,
            tenant_id   UUID        NOT NULL,
            data        JSONB       NOT NULL DEFAULT '{}',
            created_at  TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (run_id, node_path, created_at)
        ) PARTITION BY RANGE (created_at)
        """
    )
    op.execute("CREATE INDEX ix_node_outputs_run_id ON node_outputs (run_id)")
    op.execute("GRANT SELECT, INSERT ON node_outputs TO flow_app")
    op.execute("ALTER TABLE node_outputs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE node_outputs FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON node_outputs
            USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
        """
    )

    # -------------------------------------------------------------------------
    # 8. Initial monthly partitions (Jun–Sep 2026)
    # -------------------------------------------------------------------------
    _partitioned = [
        ("runs", "started_at"),
        ("run_events", "ts"),
        ("node_runs", "started_at"),
        ("node_outputs", "created_at"),
    ]
    for table, _ in _partitioned:
        for year, month in _PARTITIONS:
            nxt_month = month + 1 if month < 12 else 1
            nxt_year = year if month < 12 else year + 1
            name = f"{table}_{year}_{month:02d}"
            op.execute(
                f"""
                CREATE TABLE {name} PARTITION OF {table}
                    FOR VALUES FROM ('{year}-{month:02d}-01')
                               TO   ('{nxt_year}-{nxt_month:02d}-01')
                """
            )


def downgrade() -> None:
    # Drop partitioned parent tables (CASCADE removes all child partitions).
    for table in ("node_outputs", "node_runs", "run_events", "runs"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    # Drop event / trigger tables (trigger_subscriptions refs workflows).
    op.drop_table("wait_subscriptions")
    op.drop_table("dead_letter_events")
    op.drop_table("processed_events")
    op.drop_table("trigger_subscriptions")

    # Drop connections before orgs (connections.tenant_id → orgs.id).
    op.drop_table("connections")

    op.drop_table("node_type_manifests")

    # Drop authoring tables in child-before-parent order.
    # workflow_routing refs both workflow_versions and workflows.
    op.drop_table("workflow_routing")
    op.drop_table("node_usages")
    op.drop_table("workflow_drafts")
    # workflow_versions triggers are dropped automatically with the table.
    op.drop_table("workflow_versions")
    op.execute("DROP FUNCTION IF EXISTS _prevent_wv_mutation()")

    # Remove FK from workflows.tenant_id → orgs.id before dropping orgs.
    op.drop_constraint("fk_workflows_tenant_id", "workflows", type_="foreignkey")

    # memberships refs both users and orgs; drop it before either parent.
    op.drop_table("memberships")
    op.drop_table("orgs")
    op.drop_table("users")

    op.drop_column("workflows", "archived")
