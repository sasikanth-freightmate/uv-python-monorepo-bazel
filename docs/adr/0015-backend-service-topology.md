# ADR-0015: Backend service topology

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter/workers), ADR-0004 (Redis/gateway), ADR-0006 (ingestion/reconciler), ADR-0012 (partition jobs), ADR-0013 (reliability)

## Context

The HLD defines logical components (API, workers, event ingestion, realtime gateway, reconciler). We need a deployable packaging and a worker-scaling model that fits a small team without prematurely adopting microservices, while still allowing independent scaling of the parts that scale differently.

## Decision

### Modular monolith at `apps/flow-backend`, role entrypoints

One codebase/build with a shared **domain core** (interpreter logic, node executors, CEL evaluator, read-model projection, shared types). It exposes five **independently-deployable entrypoints**, selected at launch:

| Entrypoint | Nature | Scales with |
|---|---|---|
| `api` | sync HTTP — draft CRUD, publish, routing, connections, validate | request rate |
| `worker` | Temporal workflows + activities | execution load |
| `ingestion` | receive/dedup/match events, fan out | event volume |
| `gateway` | long-lived SSE/WS, Redis → browser | connected clients |
| `reconciler` | control loop: Postgres desired-state → Temporal Schedules | ~singleton |

- The **`reconciler`** and periodic jobs (partition maintenance, retention `DROP PARTITION`, OAuth token health) run **leader-elected / singleton** to avoid duplicate work.
- The **`gateway`** is **stateless per instance via Redis pub/sub** — any instance serves any client by subscribing to `run:{id}`, so it scales horizontally with no sticky sessions.
- Microservices are **deferred**: the domain core must be shared between `api` and `worker` regardless, so splitting repos early adds packaging overhead for no benefit. Carve out a true service later exactly where load demands it.

### Worker task-queue partitioning by workload class (config-driven)

The `worker` entrypoint partitions Temporal work across **three task queues**, each backed by its own worker pool:

- **workflow** — interpreter + eval-workflow decisions (light, CPU, must stay responsive)
- **light-activity** — `recordProgress`, `evaluate`, projection (fast)
- **heavy-activity** — node executors doing external IO (LLM extraction, HTTP, email, enrichment — slow, IO-bound, variable latency)

Which queues a worker polls and which activities/workflows it registers is controlled by **process-arg configuration** (e.g. `worker --queues=heavy --activities=llm,http`). So `worker-light` and `worker-heavy` are independently-scaled deployments of **one binary**, no code forks. This insulates the responsive control plane from slow external calls and lets each pool scale by its own pressure.

Further partitioning (per activity-type, or **per-tenant** queues for noisy-neighbor isolation) is **deferred** to the scaling/tenant-isolation work — it's the natural next lever.

## Consequences

**Positive**

- One build, one repo, one set of models; the shared domain core lives in exactly one place.
- Each role scales independently; heavy IO can't starve responsive workflow/light-activity work.
- Config-driven worker shaping means new deployment topologies need no code changes.
- A clear, organic path to peel a role into its own service when load demands.

**Negative / constraints**

- One artifact means a change to the core redeploys all roles (mitigated by role-targeted rollouts).
- Leader election is required for the reconciler/jobs (a coordination dependency).
- More task queues = more worker deployments to operate and capacity-plan.

## Alternatives considered

- **Microservices per concern** — deferred: duplicated infra and cross-service contracts for a small team; the shared core makes early splitting counterproductive.
- **Single shared task queue** — rejected: heavy IO activities cause head-of-line blocking and noisy-neighbor effects against responsive control flow.
- **Per-tenant queues now** — deferred to scaling; premature before noisy-neighbor is an observed problem.
