"""Integration tests for email/password auth & tenant context (ADR-0011, ADR-0017).

Drives the real ASGI app against a real Postgres (with RLS, as the non-superuser
``flow_app`` role). Exercises the full path: register → login (our HS256 token) →
active-org resolution → membership check → RLS-scoped reads.

Requires Docker — run with:
    bazel test //apps/flow_backend:auth_integration_test --spawn_strategy=local
"""

import unittest
import uuid

import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from testcontainers.postgres import PostgresContainer

from apps.flow_backend.config import Settings
from apps.flow_backend.infrastructure.auth.tenant_context import reset_active_org, set_active_org
from apps.flow_backend.roles.api import build_app

JWT_SECRET = "integration-test-secret"


def _alembic_cfg(async_url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", "apps/flow_backend/migrations")
    cfg.attributes["db_url"] = async_url
    return cfg


class AuthIntegrationTest(unittest.IsolatedAsyncioTestCase):
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

    async def _register(self, password: str = "pw") -> tuple[str, str]:
        email = f"{uuid.uuid4().hex}@x.com"
        resp = await self.client.post(
            "/api/v1/auth/register", json={"email": email, "password": password}
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        return email, resp.json()["user_id"]

    def _grant(self, user_id: str, org: uuid.UUID, role: str = "editor") -> None:
        with self._su_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO memberships (user_id, tenant_id, role) VALUES (:u, :o, :r)"
                ),
                {"u": user_id, "o": str(org), "r": role},
            )

    async def _login(self, email: str, password: str = "pw") -> str:
        resp = await self.client.post(
            "/api/v1/auth/login", json={"email": email, "password": password}
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()["access_token"]

    def _headers(self, token: str, org: uuid.UUID | None = None) -> dict:
        h = {"Authorization": f"Bearer {token}"}
        if org is not None:
            h["X-Org-Id"] = str(org)
        return h

    # ── tests ───────────────────────────────────────────────────────────────

    async def test_register_login_author_and_read(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)
        token = await self._login(email)

        create = await self.client.post(
            "/api/v1/workflows/", json={"name": "My Flow"}, headers=self._headers(token, self.org_a)
        )
        self.assertEqual(create.status_code, 201, create.text)
        workflow_id = create.json()["workflow_id"]

        got = await self.client.get(
            f"/api/v1/workflows/{workflow_id}", headers=self._headers(token, self.org_a)
        )
        self.assertEqual(got.status_code, 200, got.text)
        self.assertEqual(got.json()["tenant_id"], str(self.org_a))

    async def test_login_sets_session_cookie(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)
        resp = await self.client.post(
            "/api/v1/auth/login", json={"email": email, "password": "pw"}
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertIn("fm_flow_token", resp.cookies)

    async def test_cookie_authenticates_without_authorization_header(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)
        await self._login(email)  # cookie now lives in the client jar

        # No Authorization header — only X-Org-Id. The session cookie must carry auth.
        resp = await self.client.post(
            "/api/v1/workflows/", json={"name": "Cookie Flow"}, headers={"X-Org-Id": str(self.org_a)}
        )
        self.assertEqual(resp.status_code, 201, resp.text)

    async def test_me_returns_memberships(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a, role="admin")
        token = await self._login(email)

        resp = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["user"]["email"], email)
        roles = {m["org_id"]: m["role"] for m in body["memberships"]}
        self.assertEqual(roles.get(str(self.org_a)), "admin")

    async def test_me_is_empty_for_member_less_user(self) -> None:
        email, _ = await self._register()
        token = await self._login(email)
        resp = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["memberships"], [])

    async def test_logout_clears_cookie(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)
        await self._login(email)
        resp = await self.client.post("/api/v1/auth/logout")
        self.assertEqual(resp.status_code, 204, resp.text)
        # delete_cookie sends an expired Set-Cookie; httpx drops it from the jar.
        self.assertNotIn("fm_flow_token", self.client.cookies)

    async def test_wrong_password_is_unauthorized(self) -> None:
        email, _ = await self._register()
        resp = await self.client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong"}
        )
        self.assertEqual(resp.status_code, 401, resp.text)

    async def test_unknown_email_is_unauthorized(self) -> None:
        resp = await self.client.post(
            "/api/v1/auth/login", json={"email": "nobody@x.com", "password": "pw"}
        )
        self.assertEqual(resp.status_code, 401, resp.text)

    async def test_duplicate_registration_conflicts(self) -> None:
        email, _ = await self._register()
        resp = await self.client.post(
            "/api/v1/auth/register", json={"email": email, "password": "pw"}
        )
        self.assertEqual(resp.status_code, 409, resp.text)

    async def test_cross_org_is_forbidden(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)  # member of A only
        token = await self._login(email)
        resp = await self.client.post(
            "/api/v1/workflows/", json={"name": "X"}, headers=self._headers(token, self.org_b)
        )
        self.assertEqual(resp.status_code, 403, resp.text)

    async def test_bad_token_is_unauthorized(self) -> None:
        resp = await self.client.post(
            "/api/v1/workflows/",
            json={"name": "X"},
            headers={"Authorization": "Bearer not-a-jwt", "X-Org-Id": str(self.org_a)},
        )
        self.assertEqual(resp.status_code, 401, resp.text)

    async def test_missing_active_org_is_bad_request(self) -> None:
        email, user_id = await self._register()
        self._grant(user_id, self.org_a)
        token = await self._login(email)
        resp = await self.client.post(
            "/api/v1/workflows/", json={"name": "X"}, headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(resp.status_code, 400, resp.text)

    async def test_rls_fails_closed_without_active_org(self) -> None:
        wf_id = uuid.uuid4()
        with self._su_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workflows (id, tenant_id, name, status, graph, version,"
                    " created_at, updated_at) VALUES (:id, :org, 'seed', 'draft', '{}', 0,"
                    " now(), now())"
                ),
                {"id": str(wf_id), "org": str(self.org_a)},
            )

        db = self.app.container.db()
        async with db.session() as s:  # no active org bound
            unscoped = await s.execute(
                text("SELECT count(*) FROM workflows WHERE id = :id"), {"id": str(wf_id)}
            )
            self.assertEqual(unscoped.scalar_one(), 0)

        token = set_active_org(self.org_a)
        try:
            async with db.session() as s:  # org_a bound → row visible
                scoped = await s.execute(
                    text("SELECT count(*) FROM workflows WHERE id = :id"), {"id": str(wf_id)}
                )
                self.assertEqual(scoped.scalar_one(), 1)
        finally:
            reset_active_org(token)


if __name__ == "__main__":
    unittest.main()
