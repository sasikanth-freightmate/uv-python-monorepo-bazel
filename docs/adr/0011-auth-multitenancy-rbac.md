# ADR-0011: Auth, multitenancy & RBAC

- **Status:** Accepted
- **Date:** 2026-06-16 (updated 2026-06-18 — authentication changed from AWS Cognito to local email/password before any deployment)
- **Deciders:** sasikanth
- **Related:** ADR-0002 (Postgres SoR), ADR-0004 (read-model), ADR-0006 (subscriptions), ADR-0008 (connection scoping), ADR-0016 (technology stack)

## Context

FM Flow is a multi-tenant product: workflows, versions, runs, connections, subscriptions, and routing policy all belong to an **org**. We need authentication, authorization, and tenant isolation, and `org_id` scoping was deferred here from ADR-0008.

## Decision

### Authentication — local email/password (identity only)

- The application **owns credentials**: `users` carries a unique `email` and a `password_hash` (**scrypt**, Python stdlib, per-password salt, constant-time verify — no third-party crypto dependency).
- **Register** (`POST /api/v1/auth/register`) creates a user; **login** (`POST /api/v1/auth/login`) verifies the password and issues a short-lived **HS256 JWT** signed with a server secret (`jwt_secret`). The token establishes **identity only** — `sub` = the app-generated **`users.id`** (UUID, the stable user key), plus `email`.
- Every request is authenticated by validating that JWT (signature + `exp` + `sub`) — no external IdP, no JWKS, no network round-trip.
- The auth layer is **issuer-agnostic** (identity = a validated JWT; authorization lives in Postgres), so adopting an external OIDC provider later (Cognito/Auth0/Clerk/WorkOS/Keycloak) is a config-level change — revisit when enterprise **SSO/federation** is required.

> **Not yet built** (required before any production use beyond internal/dev): password reset, MFA, email verification, account lockout, and a rotation story for `jwt_secret` (a leak forges any identity). Tokens are stateless, so revocation is TTL-based — no server-side session invalidation before expiry.

### Authorization & membership — in our Postgres

- The identity token carries **no org or role**. A **`memberships(user_id = users.id, org_id, role)`** table in Postgres is the source of truth for *which orgs a user belongs to and their role in each*.
- **Multi-org is supported**: a user may belong to several orgs. The **active org** for a request is taken from the request (selected workspace) and **validated against `memberships`** before anything proceeds.
- **Roles:** `admin` / `editor` / `viewer`.
  - **Admin** — everything + **manage connections/secrets** (ADR-0008 crown jewels) + member management.
  - **Editor** — create/edit/**publish** workflows, **promote/rollback canary**, view runs.
  - **Viewer** — read-only (workflows + runs).
- Role changes take effect immediately (a Postgres update), with no IdP round-trip.

### Tenancy — pool model with Postgres RLS

- **Shared DB, row-level `org_id`** on every table. Isolation is **structural via Postgres RLS**, not query discipline — a forgotten filter **fails closed** instead of leaking.
- The resolved `org_id` (from validated membership) sets the RLS session variable for the request/activity.
- **One shared Temporal namespace.** `org_id` is part of **run context**: a run is started *with* its org; the interpreter passes it to **every activity**, which sets the RLS session var before touching Postgres. `run_id`, `node_runs`, `*_subscriptions`, routing rows are org-scoped; **S3 keys are org-prefixed**; event ingestion matches only within-org subscriptions.

## Consequences

**Positive**

- Auth is self-contained — no external IdP dependency, so local dev and Testcontainers integration tests are hermetic. Authz/membership live next to the data they protect (RLS).
- Multi-org users and instant role changes via a Postgres update (no IdP round-trip).
- RLS makes tenant isolation a database invariant — the safest pool-model posture.

**Negative / constraints**

- **`org_id` must cross the Temporal boundary** — the chief hazard of pooling through the engine. Run context carries it; every data-touching activity must set the RLS session var. A miss leaks across tenants.
- Active-org selection must always be validated against `memberships` (never trust a client-supplied org).
- RLS adds policy complexity and must be tested per table; the membership table is security-critical.
- We **own credential security** — password reset, MFA, lockout, email verification and `jwt_secret` rotation are ours to build (see the *Not yet built* note above).
- `users.id` is the join key everywhere; the membership table and the JWT-signing secret are both security-critical.

## Alternatives considered

- **Silo tenancy (DB/schema/namespace per tenant)** — stronger isolation, rejected for v1 operational cost (migrations × N, namespace sprawl); reserve for enterprise demands.
- **AWS Cognito (managed IdP, identity-only)** — the original decision here; rejected before deployment for poor DX, no first-party local emulator (an obstacle to local dev and integration tests, ADR-0017), and awkward claim/flow customization, for no lock-in benefit since authorization lives in our DB.
- **RBAC via IdP groups/claims** (e.g. Cognito groups) — rejected: single-org limitation or group sprawl (`org_<id>__<role>`), and it couples authorization to the IdP; app-DB membership is more flexible.
- **Managed IdP (Auth0 / Clerk / WorkOS / Zitadel) or self-hosted OIDC (Keycloak/Ory)** — deferred; reconsider when B2B SSO/SCIM is on the roadmap. The issuer-agnostic design keeps this a low-effort switch.
- **Inherit identity from the FreightMate platform shell** — superseded by owning auth locally.
