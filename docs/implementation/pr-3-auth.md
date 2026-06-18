# PR-3 · Auth & tenant context — implementation plan

Backed by [ADR-0011](../adr/0011-auth-multitenancy-rbac.md) (auth/multitenancy/RBAC),
[ADR-0017](../adr/README.md) (testing), [ADR-0019](../adr/0019-dependency-injection-python.md) (DI),
[ADR-0024] (HTTP exception mapping). **Deps:** PR-2 (schema + RLS already in migration `0002`). Status: plan draft, 2026-06-18.

## Goal

Turn the running app from fail-closed-returns-nothing into a real tenant-scoped API:
1. **AuthN** — validate the Cognito JWT against JWKS; identity = `sub` (+ email).
2. **Tenant resolution** — validate the request's active org against `memberships`; capture `role`.
3. **Isolation** — push the resolved org into `SET LOCAL app.tenant_id` so RLS scopes every query.

Plus `orgs` / `users` / `memberships` read/write access (tables already exist from PR-2).

## Decisions (locked in brainstorm 2026-06-18)

| # | Decision | Choice |
|---|----------|--------|
| A | Active-org transport | **`X-Org-Id` header**, validated against memberships (never trusted) |
| B | Tenant → session | **ContextVar + explicit `SET LOCAL`** as first statement in `Database.session()` |
| C | Unknown `sub` | **JIT-upsert** `users` row; memberships pre-granted out-of-band → no membership = 403 |
| D | RBAC scope | **Resolve role + build `require_role()` guard**; defer per-endpoint enforcement to later PRs |
| — | JWT lib | **PyJWT + `PyJWKClient`** (cached JWKS, `kid` handling) |
| — | JWKS test fixture | Containerized **`mock-oauth2-server`** (real network JWKS + RS256), per ADR-0017 |
| — | Missing `X-Org-Id` | Hard **400** (no implicit default org) |
| — | `/health` | Stays unauthenticated |

## Request lifecycle

```
Authorization: Bearer <jwt>     X-Org-Id: <candidate org O>
        │                               │
1. AuthN dep (PyJWT/PyJWKClient): verify sig RS256, iss, aud, exp, token_use
        │                               │   → 401 on any failure
2. JIT upsert users(sub,email)          │   (no RLS on users)
        │                               │
3. Membership check  ◄──────────────────┘
   session → SET LOCAL app.tenant_id = O
   SELECT role FROM memberships WHERE user_id = sub
     ├─ row  → role captured (RLS already constrained visible rows to O)
     └─ none → 403
        │
4. tenant_ctx (ContextVar) := TenantContext(org_id=O, sub, email, role)
        │
5. endpoint → use case → UoW → Database.session()
   first stmt: SET LOCAL app.tenant_id = tenant_ctx.org_id
```

**Membership-via-candidate-org trick:** `memberships` is RLS-protected on `tenant_id = current_setting('app.tenant_id')`
([`0002_full_schema.py:86-100`](../../apps/flow_backend/migrations/versions/0002_full_schema.py#L86-L100)). We set the var to
the *candidate* `O` from the header, then `SELECT … WHERE user_id = sub`. RLS itself restricts rows to org `O`, so a forged
`X-Org-Id` the user isn't in returns nothing → 403. No RLS bypass needed, fail-closed by construction.
(A future "list my workspaces" switcher will need a privileged cross-org read — **deferred**, noted below.)

## Session / RLS mechanism (the load-bearing detail)

`orgs`/`users` have **no RLS** (looked up during auth, before tenant is known). Everything else is RLS-protected.

With asyncpg we **cannot** issue `SET LOCAL` from SQLAlchemy's sync `after_begin` event (can't `await`). Implement it as the
first explicit statement in the single choke point, [`infrastructure/database.py`](../../apps/flow_backend/infrastructure/database.py#L26-L29):

```python
@asynccontextmanager
async def session(self) -> AsyncIterator[AsyncSession]:
    async with self._session_factory() as session:
        org_id = tenant_ctx.get(None)
        if org_id is not None:
            await session.execute(text("SET LOCAL app.tenant_id = :o"), {"o": str(org_id)})
        yield session
```

- **`SET LOCAL`** (not `SET`) → transaction-scoped; auto-clears on the UoW commit so pooled connections return clean.
- Applies to the UoW's reads too — the UoW commits only at `__aexit__` ([`unit_of_work.py:56-68`](../../apps/flow_backend/application/workflows/unit_of_work.py#L56-L68)).
- ContextVar unset (outbox relay, future Temporal activities) → no var → RLS denies all → **fail-closed**.
- ContextVars are per-`asyncio.Task`; each request is its own task, so no cross-request leakage. Set in the auth dep, reset in `finally`.

## File-by-file

### New

| Path | Contents |
|------|----------|
| `domain/identity/__init__.py` | — |
| `domain/identity/models.py` | `Role(Enum)` (admin/editor/viewer), `User`, `Membership` value objects |
| `domain/identity/repositories.py` | `UserRepository`, `MembershipRepository` Protocols (ADR-0019) |
| `domain/identity/exceptions.py` | `AuthenticationError`, `MembershipNotFound`, `MissingActiveOrg` |
| `infrastructure/auth/__init__.py` | — |
| `infrastructure/auth/jwks_verifier.py` | `JwksVerifier` — `PyJWKClient` (cached), verifies sig/iss/aud/exp/token_use → `Claims(sub,email)` |
| `infrastructure/auth/tenant_context.py` | `TenantContext` dataclass + `tenant_ctx: ContextVar` + set/reset helpers |
| `infrastructure/identity/repositories.py` | SQLAlchemy `UserSQLAlchemyRepository` (JIT upsert), `MembershipSQLAlchemyRepository` |
| `api/auth/__init__.py` | — |
| `api/auth/dependencies.py` | `get_tenant_context` FastAPI dep (`@inject`, pulls verifier/db/resolver); `require_role(*roles)` guard factory |
| `api/auth/resolver.py` | `MembershipResolver` — orchestrates JIT upsert + candidate-org membership check |
| `containers/identity.py` | `IdentityContainer` — verifier (Singleton from settings), resolver (Factory) |

### Modified

| Path | Change |
|------|--------|
| `config.py` | Add `cognito_issuer: str`, `cognito_audience: str`, `cognito_jwks_url: str` (or derive from issuer) |
| `containers/__init__.py` | Add `identity = providers.Container(IdentityContainer, db=db, settings=settings)` |
| `infrastructure/database.py` | ContextVar read + `SET LOCAL` (above) |
| `api/exception_handlers.py` | Map `AuthenticationError→401`, `MissingActiveOrg→400`, `MembershipNotFound→403` |
| `api/workflows/endpoints.py` | Replace placeholder `tenant_id: uuid.UUID` params ([`endpoints.py:21,54`](../../apps/flow_backend/api/workflows/endpoints.py#L21)) with `ctx: TenantContext = Depends(get_tenant_context)`; pass `TenantId(ctx.org_id)` |
| `roles/api.py` | (no structural change — dep resolves via existing container wiring) |
| `BUILD.bazel` | Add new srcs to `flow_backend_lib`; add `@pypi//pyjwt`, `@pypi//cryptography`; new test targets |

## Config additions

```python
class Settings(BaseServiceSettings):
    ...
    cognito_issuer: str        # https://cognito-idp.<region>.amazonaws.com/<pool-id>
    cognito_audience: str      # app client id
    cognito_jwks_url: str = "" # default derived from issuer + /.well-known/jwks.json
```

Tests point `cognito_issuer`/`cognito_jwks_url` at the `mock-oauth2-server` container.

## Test plan (ADR-0017)

**Unit** — `tests/unit/auth/test_claims.py` (tag `unit`), pure claim validation, no network:
- valid claims parse; expired `exp`; wrong `iss`; wrong `aud`; wrong `token_use`; missing `sub`; malformed token.

**Integration** — `tests/integration/test_auth.py` (tags `integration`, `requires-docker`), `mock-oauth2-server` + Postgres testcontainers, app role `rls_tester` (granted `flow_app`, subject to RLS) per the existing [migrations test pattern](../../apps/flow_backend/tests/integration/test_migrations.py#L46-L52):
- **happy path** — valid token + membership in `O` → 2xx, role resolved, can read an own-org workflow.
- **cross-org blocked** — sub is member of A, sends `X-Org-Id: B` → **403** (and RLS would yield nothing regardless).
- **bad token** — bad signature / expired / unknown `kid` / wrong `aud` → **401**.
- **missing `X-Org-Id`** → **400**.
- **JIT provisioning** — first-seen sub creates exactly one `users` row; repeat request → no duplicate.
- **fail-closed** — a session opened with the ContextVar unset sees zero RLS-protected rows.
- **guard primitive** — `require_role('editor')` allows editor/admin, blocks viewer (unit-level on the factory).

JWKS fixture: real RS256 tokens signed by `mock-oauth2-server`, fetched over the network — honors "no in-code mock at the boundary."

## Bazel wiring

- Append new `srcs` to `flow_backend_lib`; add deps `@pypi//pyjwt`, `@pypi//cryptography`.
- `py_test` `auth_unit_test` — tag `unit`, dep `:flow_backend_lib`.
- `py_test` `auth_integration_test` — tags `integration`, `requires-docker`; deps `:flow_backend_lib`, `@pypi//httpx`, `@pypi//testcontainers`, `@pypi//psycopg2_binary`, `@pypi//pyjwt`.
- Verify `pyjwt`/`cryptography` present in the pip lock; add if missing.

## Task sequence

1. Settings fields + plumb `mock-oauth2-server` issuer for tests.
2. `JwksVerifier` + unit tests (claim parsing) — pure, fast, no deps.
3. `TenantContext` + ContextVar; `Database.session()` `SET LOCAL`.
4. `domain/identity` models + repo protocols; SQLAlchemy repos (JIT upsert + membership check).
5. `MembershipResolver` + `IdentityContainer`; wire into `ApplicationContainer`.
6. `get_tenant_context` dep + `require_role` guard; exception handlers (401/400/403).
7. Swap placeholder `tenant_id` params in workflows endpoints.
8. Integration test (full lifecycle) + Bazel targets.
9. `bazel test //apps/flow_backend:all` green.

## Out of scope / deferred

- **"List my workspaces"** cross-org membership read (switcher) — needs a SECURITY-DEFINER/privileged path; not in PR-3.
- **Per-endpoint role enforcement** (publish=editor, connections=admin) — lands with those endpoints (PR-5/7/12).
- **Temporal activity RLS var** — same ContextVar primitive reused in PR-9/10; only the HTTP path is wired here.
- Cognito user lifecycle (delete/recreate → membership migration) — operational, not code.

## Risks / watch-items

- **`SET LOCAL` needs an active transaction.** AsyncSession begins one lazily on first execute; ensure no commit/rollback occurs between the `SET LOCAL` and downstream queries (UoW already commits only at exit).
- **ContextVar hygiene** — reset token in a `finally` in the dep so a worker task never inherits a stale org.
- **JWKS caching** — cache keys but bound TTL / handle rotation; `PyJWKClient` does this, confirm `kid` miss refetches.
- **`flow_app` must not have `BYPASSRLS`** — tests run under `rls_tester` to prove RLS actually applies.
