# ADR-0011: Auth, multitenancy & RBAC

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0002 (Postgres SoR), ADR-0004 (read-model), ADR-0006 (subscriptions), ADR-0008 (connection scoping)

## Context

FM Flow is a multi-tenant product: workflows, versions, runs, connections, subscriptions, and routing policy all belong to an **org**. We need authentication, authorization, and tenant isolation, and `org_id` scoping was deferred here from ADR-0008.

## Decision

### Authentication — AWS Cognito (identity only)

- A **Cognito User Pool** is the identity provider (hosted UI / OIDC, MFA and federation available).
- FM Flow validates the Cognito-issued **JWT** via the pool's JWKS on every request. The token establishes **identity only** — the stable user key is the Cognito **`sub`** (plus email).
- No login/signup/onboarding is built in the app beyond integrating Cognito.

### Authorization & membership — in our Postgres

- Cognito does **not** carry org or role. A **`memberships(user_id = cognito sub, org_id, role)`** table in Postgres is the source of truth for *which orgs a user belongs to and their role in each*.
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

- Identity outsourced to Cognito; authz/membership live next to the data they protect (RLS), decoupled from the IdP.
- Multi-org users and instant role changes without touching Cognito.
- RLS makes tenant isolation a database invariant — the safest pool-model posture.

**Negative / constraints**

- **`org_id` must cross the Temporal boundary** — the chief hazard of pooling through the engine. Run context carries it; every data-touching activity must set the RLS session var. A miss leaks across tenants.
- Active-org selection must always be validated against `memberships` (never trust a client-supplied org).
- RLS adds policy complexity and must be tested per table; the membership table is security-critical.
- Cognito `sub` is the join key everywhere — deleting/recreating a Cognito user needs a membership-migration story.

## Alternatives considered

- **Silo tenancy (DB/schema/namespace per tenant)** — stronger isolation, rejected for v1 operational cost (migrations × N, namespace sprawl); reserve for enterprise demands.
- **RBAC via Cognito groups** — rejected: single-org limitation or group sprawl (`org_<id>__<role>`), and it couples authorization to the IdP; app-DB membership is more flexible.
- **Inherit identity from the FreightMate platform shell** — superseded by the decision to stand up Cognito.
