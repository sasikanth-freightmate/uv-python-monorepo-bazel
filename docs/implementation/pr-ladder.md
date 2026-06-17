# FM Flow — v1 Implementation PR Ladder

A dependency-ordered chain of small, reviewable PRs that stand up v1 (linear + binary-condition scope; single interpreter workflow, no child workflows). Backed by [ADR-0001…0017](../adr/README.md), the [HLD](../architecture/hld-overview.md), and the [data model](../architecture/data-model.md). Status: plan draft, 2026-06-16.

**Stack (locked, ADR-0016):** **Python + FastAPI**; Temporal `temporalio`; CEL via `cel-python`; SQLAlchemy(async)+Alembic+asyncpg; `redis-py`; **SSE self-hosted gateway**; frontend gets a **TS client generated from FastAPI's OpenAPI**.

## Testing & quality policy (ADR-0017) — applies to EVERY PR

- **Unit tests** for pure logic (no mocks — the logic is pure).
- **Integration tests against real dependencies via Testcontainers** (Postgres, Redis, Temporal test server, S3/KMS via LocalStack, JWKS issuer fixture).
- **No mocks/stubs in production code** — dependencies are built in order so nothing needs faking "in between"; the ordering below reflects that.
- **Third-party SaaS** (Slack/SendGrid/OAuth/enrichment) → **containerized fakes at the network boundary** (WireMock/MockServer) or sandboxes — a real network call, not an in-code mock.
- **Green & running at every commit**; `main` always deployable; each PR leaves the system working.
- E2E (`flow-ui` + Playwright) for user-facing happy paths (authoring, live trace).

**Philosophy:** foundations → **walking skeleton** (PR-14 runs a workflow) → thicken → triggers/canary/reliability. **Milestones:** 🟢 *Authoring* (PR-8) · 🟡 *Runs end-to-end* (PR-14) · 🔵 *Live trace + retry* (PR-18) · 🟣 *Triggers live* (PR-20) · ⭐ *v1 complete* (PR-23).

---

## Phase 0 — Foundations

**PR-1 · Backend scaffold** — `apps/flow-backend` (Python/FastAPI), shared domain-core package + 5 role entrypoints (`api`/`worker`/`ingestion`/`gateway`/`reconciler`) as runnable stubs; config loader (process args), health endpoints, structured logging; `rules_python` Bazel wiring; `docker-compose` (Postgres/Redis/Temporal/LocalStack). _ADR-0015, 0016._ _Deps: none._
_Tests: unit — config parsing. Integration (Testcontainers) — each role boots, `/health` 200._

**PR-2 · DB migrations + RLS** — all tables via Alembic; RLS policies (fail-closed) + `SET LOCAL` org var; time-range partitioning on `run_events`/`runs`/`node_runs`/`node_outputs`. _ADR-0011, 0012._ _Deps: PR-1._
_Tests: integration (Postgres) — migrations apply; **RLS denies cross-org reads**; partitions create; FK/immutability constraints hold._

**PR-3 · Auth & tenant context** — Cognito JWT validation (JWKS); `memberships` → active-org validation → RLS var; orgs/users/memberships. _ADR-0011._ _Deps: PR-2._
_Tests: unit — claim parsing. Integration (JWKS fixture + Postgres) — valid token resolves membership & scopes; cross-org token blocked; bad token 401._

## Phase 1 — Authoring

**PR-4 · Node-type registry** — manifest model (`config_schema`, `output_spec` static|from_config, `storage_lane`, `retry_safe`); built-in catalog seed; `GET /node-types`. _ADR-0009, 0014._ _Deps: PR-1._
_Tests: unit — `output_spec` resolution (static & from_config). Integration — catalog served._

**PR-5 · Workflow + draft CRUD** — create workflow; autosave draft (optimistic concurrency); `content` JSONB + `node_usages` index. _ADR-0007, 0012._ _Deps: PR-3, PR-4._
_Tests: integration — create/autosave; **stale `draft_revision` → 409**; `node_usages` rebuilt; RLS-scoped._

**PR-6 · Validation + expression core** — reference resolution over declared/`from_config` outputs; CEL type-check via **`cel-python`**; structured-builder↔CEL; broken-ref (publish-blocking). _ADR-0010, 0014._ _Deps: PR-4, PR-5._
_Tests: unit — resolution, CEL pass/fail, broken-ref, structured↔CEL round-trip. Integration — `validate` endpoint._

**PR-7 · Publish + versions** — snapshot immutable version (append-only, content hash); routing `live_version`; version list/get/restore-as-draft. _ADR-0007, 0012._ _Deps: PR-5, PR-6._
_Tests: integration — publish snapshots; **UPDATE on version denied**; restore → new draft; no-op publish rejected._

**PR-8 · 🟢 Frontend ↔ backend (authoring)** — generate typed **TS client from OpenAPI**; replace `flow-ui` mock `data.js` (workflows/drafts/manifests/validation/publish). _ADR-0016._ _Deps: PR-4…7._
_Tests: generated client typechecks; **Playwright e2e** — author → validate → publish against real backend._

## Phase 2 — Execution (real nodes, real secrets — no stubs)

**PR-9 · Temporal wiring + worker** — namespace; task queues (`workflow`/`light-activity`/`heavy-activity`); config-driven `temporalio` worker registration. _ADR-0001, 0015._ _Deps: PR-1._
_Tests: integration (Temporal test server) — worker registers/polls; a trivial real workflow completes._

**PR-10 · Interpreter + read-model projection** — single interpreter walks the DAG (binary branches); `recordProgress` → append `run_events` → project `node_runs`/`runs`. Proven with **real credential-free nodes** (`trigger → delay`), started via the Temporal client in tests — **no echo/no-op stub**. _ADR-0001, 0004, 0012._ _Deps: PR-9, PR-2._
_Tests: unit — DAG walk, projection reducer. Integration (Temporal + Postgres) — real run appends events, projects state, timeline correct._

**PR-11 · `evaluate` activity (CEL) + branching** — condition/branch + `filter` evaluated in an activity reading referenced outputs from Postgres/S3. _ADR-0003, 0010._ _Deps: PR-10._
_Tests: integration — binary branch takes correct path both directions; `filter` drops/continues. Unit — CEL eval fixtures._

**PR-12 · Connections / credentials** — CRUD; **KMS-envelope** (LocalStack KMS); OAuth refresh-on-use (single-flight); resolution helper for activities; redaction. Built **before** any secret-resolving executor. _ADR-0008._ _Deps: PR-3._
_Tests: integration (LocalStack KMS + Postgres) — encrypt/decrypt; **refresh-on-use against a containerized token endpoint**; single-flight; **read-model redaction**; RLS-scoped._

**PR-13 · Node executors + storage lanes** — concrete executors (`http`, `record`, `notify`, `email`, `enrich`, `assign`); output → Postgres (`node_outputs`) or S3 per lane; secrets resolved via PR-12. _ADR-0002, 0009._ _Deps: PR-10, PR-12._
_Tests: integration — `http`/`notify`/`email` against **containerized fakes** (MockServer) with contract assertions; lane routing (small→PG, large→S3 via LocalStack); secrets resolved & redacted._

**PR-14 · 🟡 Manual run + run read APIs** — trigger a version/draft on demand; `GET` run + `node_runs`. **Workflow runs end-to-end.** _ADR-0005._ _Deps: PR-10…13._
_Tests: integration — full linear run with branch + a real action node; statuses/timeline correct. Playwright e2e — run from editor._

## Phase 3 — Realtime + reporting

**PR-15 · Redis bus** — `recordProgress` best-effort publish to `run:{id}` after the durable append. _ADR-0004._ _Deps: PR-10._
_Tests: integration (Redis) — durable append precedes publish; **publish failure doesn't fail the activity**; subscriber receives deltas._

**PR-16 · 🔵 Gateway (SSE) + live trace** — Starlette SSE + `redis-py` pub/sub; `flow-ui` run-detail snapshot-on-connect + `EventSource` deltas. _ADR-0004, 0015, 0016._ _Deps: PR-14, PR-15._
_Tests: integration (Redis) — gateway streams deltas; **reconnect re-snapshots, no gap**. Playwright e2e — live trace updates._

**PR-17 · Run history + dashboard** — read APIs (history, dashboard health aggregates) + `flow-ui` wiring. _ADR-0004._ _Deps: PR-14._
_Tests: integration — filters, version-grouped aggregates. e2e — history/dashboard._

**PR-18 · Retry-from-failed** — new run on same version seeded from read-model (skip succeeded, resume at failure); "Retry from here". _ADR-0005._ _Deps: PR-14._
_Tests: integration — fail at node N → retry reuses upstream outputs, resumes at N, linked `retry_of`._

## Phase 4 — Triggers

**PR-19 · Scheduled triggers** — `reconciler` (leader-elected) → Temporal Schedules (`wf-{id}`); dispatcher → weighted `live_version` → interpreter. _ADR-0006, 0015._ _Deps: PR-7, PR-9._
_Tests: integration (Temporal) — publish scheduled wf → Schedule created; config change reconciles; **single-active under contention**; dispatcher selects live._

**PR-20 · 🟣 Event ingestion + triggers** — `ingestion`; dedup (`processed_events`); matching (`trigger_subscriptions`); eval-workflow (enrichment + CEL filter) → StartWorkflow; `dead_letter_events`. _ADR-0006, 0013._ _Deps: PR-9, PR-11, PR-12._
_Tests: integration — **duplicate `event_id` starts exactly one run**; filter match/no-match (enrichment against containerized fake); exhausted retries → dead-letter._

## Phase 5 — Canary + reliability + ops

**PR-21 · Canary / traffic-split** — routing `{canary_version, weight, sticky_key}`; sticky-by-key weighted select at run-start; promote/rollback; version-grouped metrics; canary UI. _ADR-0007._ _Deps: PR-19, PR-20._
_Tests: unit — hash bucketing, **monotonic ramp**. Integration — same key → same version; promote/rollback; metrics by version._

**PR-22 · ⭐ Reliability hardening** — deterministic `workflow_id` + dedup; system-derived idempotency keys; run-level timeout; admin-cancel. _ADR-0013._ _Deps: PR-14, PR-20._
_Tests: integration — **duplicate trigger → one run**; idempotency key dedups at a containerized API; run timeout fails the run; admin-cancel._

**PR-23 · Ops jobs** — partition maintenance + retention `DROP PARTITION`; OAuth token-health; dead-letter alerting. _ADR-0012, 0013._ _Deps: PR-2, PR-20._
_Tests: integration — partition create/drop; retention drops aged partitions; expired connection → `error`; dead-letter alert fires._

---

## Parallelization

- After **PR-3**, two tracks run in parallel: **Authoring (PR-4→8)** and **Execution (PR-9→14)** — they converge at PR-16 (live trace needs both).
- **PR-4 (node-type registry)** unblocks both tracks — prioritize it.
- **PR-12 (connections)** only needs PR-3, so it can be built early on the execution track; it gates PR-13 (no stubbed secrets).

## Out of v1 (deferred)

Parallel/Join/Map/event-Wait (child workflows), node-type extensibility, scaling/tenant-isolation (per-tenant queues, rate limits), code-resolver dynamic outputs, full ops console.
