# Architecture Decision Records

Decisions for the FM Flow workflow-builder backend, captured during the 2026-06-16 design session (see [`../brainstorming/brainstorming-session-2026-06-16.md`](../brainstorming/brainstorming-session-2026-06-16.md)). For the system-wide picture, see [`../architecture/hld-overview.md`](../architecture/hld-overview.md).

| ADR | Title | Status | One-line |
|---|---|---|---|
| [0001](0001-interpreter-on-temporal-execution-model.md) | Interpreter-on-Temporal execution model | Accepted | One generic Temporal workflow walks a pinned definition as data; Restate evaluated & rejected. |
| [0002](0002-run-state-stored-outside-temporal.md) | Run state stored outside Temporal | Accepted | Temporal = orchestration; Postgres = system of record; S3 = large payloads; storage lane declared statically per step type. |
| [0003](0003-condition-evaluation-via-activity.md) | Condition/expression evaluation via activity | Accepted | Conditions eval in an `evaluate` activity (no dual-state); replay-safe via immutability + Temporal result caching. |
| [0004](0004-run-read-model-and-realtime-reporting.md) | Run read-model & real-time reporting | Accepted | Postgres read-model written via idempotent `recordProgress` activity; Redis bus → SSE/WS; snapshot+deltas. |
| [0005](0005-run-failure-and-recovery.md) | Run failure handling & recovery | Accepted | Fail-fast + binary status; retry-from-failed (same version, Case A) seeded from the read-model. |
| [0006](0006-trigger-system-and-provisioning.md) | Trigger system & dynamic provisioning | Accepted | Unified ingestion/matching (trigger + wait subs); desired-state reconciler; durable eval-workflow for I/O filters. |
| [0007](0007-versioning-routing-policy-and-canary.md) | Versioning routing policy & canary | Accepted | `current_version` → routing policy `{live, canary?, weight, sticky_key}`; sticky-by-key, monotonic ramp. **Amends 0001.** |
| [0008](0008-credentials-and-secrets.md) | Credentials & secrets | Accepted | Connections by id; secrets resolved JIT in activities only; redacted from history/read-model; KMS-envelope in Postgres. |
| [0009](0009-node-type-system.md) | Node-type system (built-in registry) | Accepted | Built-in catalog; node type = manifest + executor; manifests served to UI (kills hardcoded schemas); schema capped to latest; `retrySafe` flag. |
| [0010](0010-expression-and-reference-subsystem.md) | Expression & reference subsystem | Accepted | CEL substrate + structured-builder UI; type-checked against declared outputs; CEL canonical storage; token interpolation = `{{ <CEL> }}`. |
| [0011](0011-auth-multitenancy-rbac.md) | Auth, multitenancy & RBAC | Accepted | Cognito = identity only; memberships+roles in Postgres; pool tenancy with RLS; `org_id` propagates into Temporal run context. |
| [0012](0012-persistence-and-event-sourced-read-model.md) | Persistence & event-sourced read-model | Accepted | Hybrid graph storage (JSONB + derived index); `run_events` log → `node_runs`/`runs` projections; time-range partitioning + tiered retention. Refines 0004. |
| [0013](0013-reliability-and-idempotency.md) | Reliability & idempotency | Accepted | Effectively-once via 3-lever stack (deterministic `workflow_id` + dedup; read-model `seq`; `retrySafe`+idempotency keys); run timeout + `dead_letter_events` + admin-cancel. Amends 0009. |
| [0014](0014-dynamic-config-derived-node-outputs.md) | Dynamic (config-derived) node outputs | Accepted | `output_schema` → `output_spec` (static or `from_config`); per-instance reference resolution; broken refs publish-blocking. Amends 0009, 0010. |
| [0015](0015-backend-service-topology.md) | Backend service topology | Accepted | Modular monolith `apps/flow-backend`; 5 role entrypoints (api/worker/ingestion/gateway/reconciler); worker task-queues split by workload class, config-driven. |
| [0016](0016-technology-stack.md) | Technology stack & realtime transport | Accepted | Python + FastAPI; `cel-python` (CEL first-class); SSE self-hosted gateway; `temporalio`/SQLAlchemy/redis-py; OpenAPI → TS client for the frontend. |
| [0017](0017-testing-and-quality-strategy.md) | Testing & quality strategy | Accepted | Every PR ships unit + Testcontainers integration tests, green at every commit; **no mocks/stubs in prod code**; third-party only via boundary fakes. |

## v1 scope note

The ADRs describe the **general architecture**. The session also took a v1 scope cut (**Scope #19** in the session log): ship a **linear + binary-condition** vocabulary and **defer** Parallel / Join / Map / in-graph event-Wait. Consequences for v1:

- The interpreter (0001) runs as a **single workflow** — no child workflows (no sub-graphs yet).
- 0006's **`wait_subscriptions` / in-graph event-Wait correlation** and **sub-run drill-down** (0004) are **deferred**; event *triggers* and scheduled triggers remain in v1.
- Everything else (0002–0005, 0007, 0008) is v1. Nothing designed is wasted — the deferred pieces are sequenced, and the general design accommodates them without rework.
