"""Integration tests for the node-type registry (PR-4; ADR-0009, ADR-0017).

Drives the real ASGI app against a real Postgres as the non-superuser
``flow_app`` role: seeds the built-in catalog, then asserts GET /node-types
serves it. The registry is global (no RLS), so no tenant context is involved.

Requires Docker — run with:
    bazel test //apps/flow_backend:node_types_integration_test --spawn_strategy=local
"""

import unittest

import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from testcontainers.postgres import PostgresContainer

from apps.flow_backend.config import Settings
from apps.flow_backend.domain.node_types.catalog import BUILTIN_CATALOG
from apps.flow_backend.roles.api import build_app


def _alembic_cfg(async_url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", "apps/flow_backend/migrations")
    cfg.attributes["db_url"] = async_url
    return cfg


class NodeTypesIntegrationTest(unittest.IsolatedAsyncioTestCase):
    container: PostgresContainer

    @classmethod
    def setUpClass(cls) -> None:
        cls.container = PostgresContainer("postgres:17")
        cls.container.start()
        cls.sync_url = cls.container.get_connection_url()
        cls.async_url = cls.sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        command.upgrade(_alembic_cfg(cls.async_url), "head")

        cls._su_engine = create_engine(cls.sync_url)
        host_part = cls.sync_url.rsplit("@", 1)[1]
        from sqlalchemy import text

        with cls._su_engine.begin() as conn:
            conn.execute(text("CREATE USER rls_tester PASSWORD 'rls_tester'"))
            conn.execute(text("GRANT flow_app TO rls_tester"))
        cls.app_async_url = f"postgresql+asyncpg://rls_tester:rls_tester@{host_part}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls._su_engine.dispose()
        cls.container.stop()

    async def asyncSetUp(self) -> None:
        self.settings = Settings(
            database_url=self.app_async_url,
            redis_url="redis://localhost:6379/0",
            jwt_secret="integration-test-secret",
        )
        self.app = build_app(self.settings)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url="http://test"
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.app.container.db().dispose()

    async def _seed(self) -> int:
        # ASGITransport doesn't fire startup events, so seed explicitly (the same
        # use case the API role runs on boot).
        return await self.app.container.node_types.seed_catalog().execute()

    # ── tests ─────────────────────────────────────────────────────────────────

    async def test_empty_before_seed(self) -> None:
        resp = await self.client.get("/api/v1/node-types")
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json(), [])

    async def test_get_serves_full_catalog_after_seed(self) -> None:
        seeded = await self._seed()
        self.assertEqual(seeded, len(BUILTIN_CATALOG))

        resp = await self.client.get("/api/v1/node-types")
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(len(body), len(BUILTIN_CATALOG))
        self.assertEqual(
            {nt["type_id"] for nt in body},
            {m.type_id for m in BUILTIN_CATALOG},
        )

    async def test_served_manifest_shape(self) -> None:
        await self._seed()
        resp = await self.client.get("/api/v1/node-types")
        by_id = {nt["type_id"]: nt for nt in resp.json()}

        email = by_id["email"]
        self.assertEqual(email["display"]["title"], "Send Email")
        self.assertEqual(email["display"]["description"], "Email a contact")
        self.assertEqual(email["display"]["subtitle"], "Email")
        self.assertEqual(email["storage_lane"], "postgres")
        self.assertFalse(email["retry_safe"])
        self.assertEqual(email["output_spec"]["kind"], "static")
        self.assertIn(
            {"path": "message_id", "type": "string"},
            email["output_spec"]["fields"],
        )
        self.assertIn("fields", email["config_schema"])

    async def test_seed_is_idempotent(self) -> None:
        await self._seed()
        await self._seed()  # re-seed upserts in place, no duplicates
        resp = await self.client.get("/api/v1/node-types")
        self.assertEqual(len(resp.json()), len(BUILTIN_CATALOG))


if __name__ == "__main__":
    unittest.main()
