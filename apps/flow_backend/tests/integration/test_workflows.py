"""Integration tests for workflow + draft CRUD (PR-5; ADR-0007, ADR-0017).

Drives the real ASGI app against a real Postgres (with RLS, as the non-superuser
``flow_app`` role). Exercises the authoring path: create → read draft → autosave
under optimistic concurrency (stale ``draft_revision`` → 409), the derived
``node_usages`` rebuild, role enforcement, and cross-org RLS isolation.

Requires Docker — run with:
    bazel test //apps/flow_backend:workflows_integration_test --spawn_strategy=local
"""

import unittest
import uuid

import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from testcontainers.postgres import PostgresContainer

from apps.flow_backend.config import Settings
from apps.flow_backend.roles.api import build_app

JWT_SECRET = "integration-test-secret"


def _alembic_cfg(async_url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", "apps/flow_backend/migrations")
    cfg.attributes["db_url"] = async_url
    return cfg


class WorkflowsIntegrationTest(unittest.IsolatedAsyncioTestCase):
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
        with cls._su_engine.begin() as conn:
            conn.execute(text("CREATE USER rls_tester PASSWORD 'rls_tester'"))
            conn.execute(text("GRANT flow_app TO rls_tester"))
        cls.app_async_url = f"postgresql+asyncpg://rls_tester:rls_tester@{host_part}"

        cls.org_a = uuid.uuid4()
        cls.org_b = uuid.uuid4()
        with cls._su_engine.begin() as conn:
            for org, name in ((cls.org_a, "Org A"), (cls.org_b, "Org B")):
                conn.execute(
                    text("INSERT INTO orgs (id, name, created_at) VALUES (:id, :n, now())"),
                    {"id": str(org), "n": name},
                )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._su_engine.dispose()
        cls.container.stop()

    async def asyncSetUp(self) -> None:
        self.settings = Settings(
            database_url=self.app_async_url,
            redis_url="redis://localhost:6379/0",
            jwt_secret=JWT_SECRET,
        )
        self.app = build_app(self.settings)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app), base_url="http://test"
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.app.container.db().dispose()

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _register(self) -> tuple[str, str]:
        email = f"{uuid.uuid4().hex}@x.com"
        resp = await self.client.post(
            "/api/v1/auth/register", json={"email": email, "password": "pw"}
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        return email, resp.json()["user_id"]

    def _grant(self, user_id: str, org: uuid.UUID, role: str = "editor") -> None:
        with self._su_engine.begin() as conn:
            conn.execute(
                text("INSERT INTO memberships (user_id, tenant_id, role) VALUES (:u, :o, :r)"),
                {"u": user_id, "o": str(org), "r": role},
            )

    async def _login(self, email: str) -> str:
        resp = await self.client.post(
            "/api/v1/auth/login", json={"email": email, "password": "pw"}
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()["access_token"]

    def _headers(self, token: str, org: uuid.UUID) -> dict:
        return {"Authorization": f"Bearer {token}", "X-Org-Id": str(org)}

    async def _editor(self, org: uuid.UUID) -> dict:
        email, user_id = await self._register()
        self._grant(user_id, org, role="editor")
        token = await self._login(email)
        return self._headers(token, org)

    def _node_usages(self, workflow_id: str) -> list[dict]:
        with self._su_engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT type_id, node_path, connection_id, version_id"
                    " FROM node_usages WHERE workflow_id = :w ORDER BY node_path"
                ),
                {"w": workflow_id},
            ).mappings().all()
        return [dict(r) for r in rows]

    async def _create(self, headers: dict, content: dict | None = None) -> str:
        body = {"name": "My Flow"}
        if content is not None:
            body["content"] = content
        resp = await self.client.post("/api/v1/workflows/", json=body, headers=headers)
        self.assertEqual(resp.status_code, 201, resp.text)
        return resp.json()["workflow_id"]

    # ── tests ───────────────────────────────────────────────────────────────

    async def test_create_then_read_draft(self) -> None:
        headers = await self._editor(self.org_a)
        content = {"nodes": [{"id": "n1", "type": "delay"}], "edges": []}
        workflow_id = await self._create(headers, content)

        got = await self.client.get(f"/api/v1/workflows/{workflow_id}", headers=headers)
        self.assertEqual(got.status_code, 200, got.text)
        body = got.json()
        self.assertEqual(body["status"], "draft")
        self.assertFalse(body["archived"])
        self.assertEqual(body["draft"]["draft_revision"], 0)
        self.assertEqual(body["draft"]["content"], content)
        self.assertIsNotNone(body["draft"]["content_hash"])

    async def test_create_rebuilds_node_usages(self) -> None:
        headers = await self._editor(self.org_a)
        cid = uuid.uuid4()
        content = {
            "nodes": [
                {"id": "n_trigger", "type": "trigger"},
                {"id": "n_notify", "type": "notify", "config": {"connection_id": str(cid)}},
            ]
        }
        workflow_id = await self._create(headers, content)

        usages = self._node_usages(workflow_id)
        self.assertEqual([u["node_path"] for u in usages], ["n_notify", "n_trigger"])
        notify = next(u for u in usages if u["node_path"] == "n_notify")
        self.assertEqual(notify["type_id"], "notify")
        self.assertEqual(notify["connection_id"], cid)
        self.assertTrue(all(u["version_id"] is None for u in usages))

    async def test_autosave_increments_revision_and_persists(self) -> None:
        headers = await self._editor(self.org_a)
        workflow_id = await self._create(headers, {"nodes": []})

        new_content = {"nodes": [{"id": "n1", "type": "email"}]}
        save = await self.client.put(
            f"/api/v1/workflows/{workflow_id}/draft",
            json={"content": new_content, "draft_revision": 0},
            headers=headers,
        )
        self.assertEqual(save.status_code, 200, save.text)
        self.assertEqual(save.json()["draft_revision"], 1)

        got = await self.client.get(f"/api/v1/workflows/{workflow_id}", headers=headers)
        self.assertEqual(got.json()["draft"]["content"], new_content)
        self.assertEqual(got.json()["draft"]["draft_revision"], 1)

    async def test_autosave_rebuilds_node_usages(self) -> None:
        headers = await self._editor(self.org_a)
        workflow_id = await self._create(headers, {"nodes": [{"id": "old", "type": "delay"}]})

        await self.client.put(
            f"/api/v1/workflows/{workflow_id}/draft",
            json={"content": {"nodes": [{"id": "a", "type": "email"}, {"id": "b", "type": "record"}]}, "draft_revision": 0},
            headers=headers,
        )
        usages = self._node_usages(workflow_id)
        self.assertEqual([u["node_path"] for u in usages], ["a", "b"])  # 'old' gone

    async def test_stale_revision_conflicts(self) -> None:
        headers = await self._editor(self.org_a)
        workflow_id = await self._create(headers, {"nodes": []})

        # First save moves the revision to 1.
        first = await self.client.put(
            f"/api/v1/workflows/{workflow_id}/draft",
            json={"content": {"nodes": []}, "draft_revision": 0},
            headers=headers,
        )
        self.assertEqual(first.status_code, 200, first.text)

        # A second save still claiming revision 0 is stale → 409.
        stale = await self.client.put(
            f"/api/v1/workflows/{workflow_id}/draft",
            json={"content": {"nodes": [{"id": "x", "type": "delay"}]}, "draft_revision": 0},
            headers=headers,
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["code"], "stale_draft_revision")

        # The losing write did not clobber the draft.
        got = await self.client.get(f"/api/v1/workflows/{workflow_id}", headers=headers)
        self.assertEqual(got.json()["draft"]["content"], {"nodes": []})

    async def test_list_returns_created_workflows_scoped_to_org(self) -> None:
        headers_a = await self._editor(self.org_a)
        await self._create(headers_a, {"nodes": []})
        await self._create(headers_a, {"nodes": []})

        resp = await self.client.get("/api/v1/workflows/", headers=headers_a)
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertGreaterEqual(len(resp.json()), 2)
        self.assertTrue(all(w["tenant_id"] == str(self.org_a) for w in resp.json()))
        self.assertNotIn("draft", resp.json()[0])  # summary shape, no draft payload

    async def test_rename_persists(self) -> None:
        headers = await self._editor(self.org_a)
        workflow_id = await self._create(headers, {"nodes": []})

        resp = await self.client.patch(
            f"/api/v1/workflows/{workflow_id}", json={"name": "Renamed"}, headers=headers
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["name"], "Renamed")

        got = await self.client.get(f"/api/v1/workflows/{workflow_id}", headers=headers)
        self.assertEqual(got.json()["name"], "Renamed")

    async def test_archive_hides_from_default_list(self) -> None:
        headers = await self._editor(self.org_a)
        workflow_id = await self._create(headers, {"nodes": []})

        patch = await self.client.patch(
            f"/api/v1/workflows/{workflow_id}", json={"archived": True}, headers=headers
        )
        self.assertEqual(patch.status_code, 200, patch.text)
        self.assertTrue(patch.json()["archived"])

        listed = await self.client.get("/api/v1/workflows/", headers=headers)
        self.assertNotIn(workflow_id, [w["id"] for w in listed.json()])

        with_archived = await self.client.get(
            "/api/v1/workflows/?include_archived=true", headers=headers
        )
        self.assertIn(workflow_id, [w["id"] for w in with_archived.json()])

    async def test_viewer_cannot_patch(self) -> None:
        editor_headers = await self._editor(self.org_a)
        workflow_id = await self._create(editor_headers, {"nodes": []})

        email, user_id = await self._register()
        self._grant(user_id, self.org_a, role="viewer")
        token = await self._login(email)
        resp = await self.client.patch(
            f"/api/v1/workflows/{workflow_id}",
            json={"name": "Nope"},
            headers=self._headers(token, self.org_a),
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_viewer_cannot_create(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a, role="viewer")
        token = await self._login(email)
        resp = await self.client.post(
            "/api/v1/workflows/", json={"name": "X"}, headers=self._headers(token, self.org_a)
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_unknown_workflow_is_not_found(self) -> None:
        headers = await self._editor(self.org_a)
        resp = await self.client.get(f"/api/v1/workflows/{uuid.uuid4()}", headers=headers)
        self.assertEqual(resp.status_code, 404, resp.text)

    async def test_cross_org_cannot_read(self) -> None:
        headers_a = await self._editor(self.org_a)
        workflow_id = await self._create(headers_a, {"nodes": []})

        # A different user, member of org_b only, cannot see org_a's workflow.
        headers_b = await self._editor(self.org_b)
        resp = await self.client.get(f"/api/v1/workflows/{workflow_id}", headers=headers_b)
        self.assertEqual(resp.status_code, 404, resp.text)


if __name__ == "__main__":
    unittest.main()
