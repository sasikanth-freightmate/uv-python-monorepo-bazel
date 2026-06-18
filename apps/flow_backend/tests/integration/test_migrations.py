"""Integration tests for DB migrations and RLS (PR-2).

Requires Docker — run with:
    bazel test //apps/flow_backend:migrations_test --spawn_strategy=local
"""

import unittest
import uuid

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from testcontainers.postgres import PostgresContainer


def _alembic_cfg(async_url: str) -> Config:
    """Alembic config for programmatic use.

    Passes the async database URL via ``config.attributes`` so that
    ``migrations/env.py`` never reads ``os.environ`` directly.
    """
    cfg = Config()
    cfg.set_main_option("script_location", "apps/flow_backend/migrations")
    cfg.attributes["db_url"] = async_url
    return cfg


class MigrationsTest(unittest.TestCase):
    container: PostgresContainer
    sync_url: str
    async_url: str
    rls_url: str

    @classmethod
    def setUpClass(cls) -> None:
        cls.container = PostgresContainer("postgres:17")
        cls.container.start()
        cls.sync_url = cls.container.get_connection_url()
        cls.async_url = cls.sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        command.upgrade(_alembic_cfg(cls.async_url), "head")

        # Shared superuser engine — reused across all tests.
        cls._su_engine = create_engine(cls.sync_url)

        # Create an app-level role subject to RLS for use in RLS tests.
        with cls._su_engine.begin() as conn:
            conn.execute(text("CREATE USER rls_tester PASSWORD 'rls_tester'"))
            conn.execute(text("GRANT flow_app TO rls_tester"))

        host_part = cls.sync_url.rsplit("@", 1)[1]
        cls.rls_url = f"postgresql+psycopg2://rls_tester:rls_tester@{host_part}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls._su_engine.dispose()
        cls.container.stop()

    # ── helpers ───────────────────────────────────────────────────────────────

    def _engine(self) -> sa.Engine:
        return self._su_engine

    def _rls_engine(self) -> sa.Engine:
        return create_engine(self.rls_url)

    def _insert_org(self, conn, org_id: uuid.UUID) -> None:
        conn.execute(
            text("INSERT INTO orgs (id, name, created_at) VALUES (:id, 'Test Org', NOW())"),
            {"id": str(org_id)},
        )

    def _insert_workflow(self, conn, wf_id: uuid.UUID, tenant_id: uuid.UUID) -> None:
        conn.execute(
            text(
                "INSERT INTO workflows"
                " (id, tenant_id, name, status, graph, version, created_at, updated_at, archived)"
                " VALUES (:id, :tid, 'wf', 'draft', '{}', 0, NOW(), NOW(), false)"
            ),
            {"id": str(wf_id), "tid": str(tenant_id)},
        )

    # ── schema ────────────────────────────────────────────────────────────────

    def test_tables_exist(self) -> None:
        expected = {
            # PR-1
            "workflows",
            "outbox_messages",
            # PR-2 identity
            "orgs",
            "users",
            "memberships",
            # PR-2 authoring
            "workflow_drafts",
            "workflow_versions",
            "workflow_routing",
            "node_usages",
            "node_type_manifests",
            # PR-2 connections
            "connections",
            # PR-2 triggers & events
            "trigger_subscriptions",
            "processed_events",
            "dead_letter_events",
            "wait_subscriptions",
            # PR-2 partitioned (parent tables reported by SQLAlchemy inspect)
            "runs",
            "run_events",
            "node_runs",
            "node_outputs",
        }
        with self._engine().connect() as conn:
            tables = set(sa.inspect(conn).get_table_names())
        missing = expected - tables
        self.assertFalse(missing, f"Missing tables: {missing}")

    def test_alembic_version_is_head(self) -> None:
        with self._engine().connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], "0004")

    def test_partitions_exist(self) -> None:
        """Monthly child partitions must be created for all four partitioned tables."""
        expected = [
            f"{table}_{year}_{month:02d}"
            for table in ("runs", "run_events", "node_runs", "node_outputs")
            for year, month in [(2026, 6), (2026, 7), (2026, 8), (2026, 9)]
        ]
        with self._engine().connect() as conn:
            rows = conn.execute(
                text("SELECT relname FROM pg_class WHERE relkind = 'r' AND relname = ANY(:names)"),
                {"names": expected},
            ).fetchall()
        found = {r[0] for r in rows}
        missing = set(expected) - found
        self.assertFalse(missing, f"Missing partitions: {missing}")

    # ── RLS ───────────────────────────────────────────────────────────────────

    def test_rls_blocks_wrong_tenant(self) -> None:
        """A row for tenant A must be invisible when tenant B is the context."""
        org_a, org_b, wf_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org_a)
            self._insert_org(conn, org_b)
            self._insert_workflow(conn, wf_id, org_a)

        rls = self._rls_engine()
        try:
            with rls.begin() as conn:
                conn.execute(text(f"SET LOCAL app.tenant_id = '{org_a}'"))
                rows = conn.execute(
                    text("SELECT id FROM workflows WHERE id = :id"), {"id": str(wf_id)}
                ).fetchall()
            self.assertEqual(len(rows), 1, "row must be visible for own tenant")

            with rls.begin() as conn:
                conn.execute(text(f"SET LOCAL app.tenant_id = '{org_b}'"))
                rows = conn.execute(
                    text("SELECT id FROM workflows WHERE id = :id"), {"id": str(wf_id)}
                ).fetchall()
            self.assertEqual(len(rows), 0, "row must be hidden for a different tenant")
        finally:
            rls.dispose()

    def test_rls_blocks_no_tenant_set(self) -> None:
        """Without app.tenant_id set, no rows are returned (fail-closed)."""
        org, wf_id = uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org)
            self._insert_workflow(conn, wf_id, org)

        rls = self._rls_engine()
        try:
            with rls.begin() as conn:
                rows = conn.execute(
                    text("SELECT id FROM workflows WHERE id = :id"), {"id": str(wf_id)}
                ).fetchall()
            self.assertEqual(len(rows), 0, "no tenant set must return no rows")
        finally:
            rls.dispose()

    def test_rls_on_connections_table(self) -> None:
        """RLS on a newly added table (connections) isolates tenants correctly."""
        org_a, org_b, conn_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org_a)
            self._insert_org(conn, org_b)
            conn.execute(
                text(
                    "INSERT INTO connections"
                    " (id, tenant_id, name, provider, status, created_at, updated_at)"
                    " VALUES (:id, :tid, 'slack', 'slack', 'connected', NOW(), NOW())"
                ),
                {"id": str(conn_id), "tid": str(org_a)},
            )

        rls = self._rls_engine()
        try:
            with rls.begin() as conn:
                conn.execute(text(f"SET LOCAL app.tenant_id = '{org_b}'"))
                rows = conn.execute(
                    text("SELECT id FROM connections WHERE id = :id"), {"id": str(conn_id)}
                ).fetchall()
            self.assertEqual(len(rows), 0, "connection must be invisible to a different tenant")

            with rls.begin() as conn:
                conn.execute(text(f"SET LOCAL app.tenant_id = '{org_a}'"))
                rows = conn.execute(
                    text("SELECT id FROM connections WHERE id = :id"), {"id": str(conn_id)}
                ).fetchall()
            self.assertEqual(len(rows), 1, "connection must be visible to its own tenant")
        finally:
            rls.dispose()

    # ── Immutability ──────────────────────────────────────────────────────────

    def test_workflow_version_immutable_via_revoke(self) -> None:
        """flow_app role must not be able to UPDATE or DELETE workflow_versions."""
        org, wf_id, ver_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org)
            self._insert_workflow(conn, wf_id, org)
            conn.execute(
                text(
                    "INSERT INTO workflow_versions"
                    " (id, tenant_id, workflow_id, version_number, content, published_at)"
                    " VALUES (:id, :tid, :wid, 1, '{}', NOW())"
                ),
                {"id": str(ver_id), "tid": str(org), "wid": str(wf_id)},
            )

        rls = self._rls_engine()
        try:
            with self.assertRaises(Exception) as ctx:
                with rls.begin() as conn:
                    conn.execute(text(f"SET LOCAL app.tenant_id = '{org}'"))
                    conn.execute(
                        text("UPDATE workflow_versions SET note = 'x' WHERE id = :id"),
                        {"id": str(ver_id)},
                    )
            self.assertIn("permission denied", str(ctx.exception).lower())

            with self.assertRaises(Exception) as ctx:
                with rls.begin() as conn:
                    conn.execute(text(f"SET LOCAL app.tenant_id = '{org}'"))
                    conn.execute(
                        text("DELETE FROM workflow_versions WHERE id = :id"),
                        {"id": str(ver_id)},
                    )
            self.assertIn("permission denied", str(ctx.exception).lower())
        finally:
            rls.dispose()

    def test_workflow_version_immutable_via_trigger(self) -> None:
        """Trigger must block UPDATE even from a superuser (defense-in-depth)."""
        org, wf_id, ver_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org)
            self._insert_workflow(conn, wf_id, org)
            conn.execute(
                text(
                    "INSERT INTO workflow_versions"
                    " (id, tenant_id, workflow_id, version_number, content, published_at)"
                    " VALUES (:id, :tid, :wid, 2, '{}', NOW())"
                ),
                {"id": str(ver_id), "tid": str(org), "wid": str(wf_id)},
            )

        with self.assertRaises(Exception) as ctx:
            with self._engine().begin() as conn:
                conn.execute(
                    text("UPDATE workflow_versions SET note = 'x' WHERE id = :id"),
                    {"id": str(ver_id)},
                )
        self.assertIn("append-only", str(ctx.exception).lower())

    # ── FK constraints ────────────────────────────────────────────────────────

    def test_fk_workflow_draft_requires_valid_workflow(self) -> None:
        """Inserting a workflow_draft with a non-existent workflow_id must fail."""
        with self.assertRaises(Exception) as ctx:
            with self._engine().begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO workflow_drafts"
                        " (workflow_id, tenant_id, draft_revision)"
                        " VALUES (:wid, :tid, 0)"
                    ),
                    {"wid": str(uuid.uuid4()), "tid": str(uuid.uuid4())},
                )
        self.assertIn("foreign key", str(ctx.exception).lower())

    def test_fk_workflow_version_requires_valid_workflow(self) -> None:
        """Inserting a workflow_version with a bogus workflow_id must fail."""
        with self.assertRaises(Exception) as ctx:
            with self._engine().begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO workflow_versions"
                        " (id, tenant_id, workflow_id, version_number, content, published_at)"
                        " VALUES (:id, :tid, :wid, 99, '{}', NOW())"
                    ),
                    {"id": str(uuid.uuid4()), "tid": str(uuid.uuid4()), "wid": str(uuid.uuid4())},
                )
        self.assertIn("foreign key", str(ctx.exception).lower())

    def test_workflow_version_unique_per_workflow(self) -> None:
        """(workflow_id, version_number) must be unique within workflow_versions."""
        org, wf_id = uuid.uuid4(), uuid.uuid4()

        with self._engine().begin() as conn:
            self._insert_org(conn, org)
            self._insert_workflow(conn, wf_id, org)
            conn.execute(
                text(
                    "INSERT INTO workflow_versions"
                    " (id, tenant_id, workflow_id, version_number, content, published_at)"
                    " VALUES (:id, :tid, :wid, 1, '{}', NOW())"
                ),
                {"id": str(uuid.uuid4()), "tid": str(org), "wid": str(wf_id)},
            )

        with self.assertRaises(Exception) as ctx:
            with self._engine().begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO workflow_versions"
                        " (id, tenant_id, workflow_id, version_number, content, published_at)"
                        " VALUES (:id, :tid, :wid, 1, '{}', NOW())"
                    ),
                    {"id": str(uuid.uuid4()), "tid": str(org), "wid": str(wf_id)},
                )
        msg = str(ctx.exception).lower()
        self.assertTrue(
            "unique" in msg or "duplicate" in msg, f"Expected unique violation, got: {msg}"
        )

    # ── Downgrade — zz prefix ensures this runs after all other tests ─────────

    def test_zz_downgrade_removes_tables(self) -> None:
        command.downgrade(_alembic_cfg(self.async_url), "base")
        with self._engine().connect() as conn:
            tables = set(sa.inspect(conn).get_table_names())
        for table in (
            "workflows",
            "outbox_messages",
            "orgs",
            "workflow_versions",
            "runs",
            "node_runs",
        ):
            self.assertNotIn(table, tables, f"{table} should be gone after downgrade")
        with self._engine().connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar()
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
