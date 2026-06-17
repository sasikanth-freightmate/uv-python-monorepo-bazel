# FM Flow — High-Level Design (overview)

A visual workflow-builder: users assemble branching workflows on a canvas, run them durably on Temporal, and observe/debug executions. This stitches together the decisions in [`../adr/`](../adr/README.md); the storage layer is detailed in [`data-model.md`](data-model.md). Status: design draft, 2026-06-16.

## Components

```mermaid
flowchart TB
    FE["<b>Frontend</b> (apps/flow-ui + packages/ui-components)<br/>Canvas editor · config panel · run trace · versions/canary · connections<br/><i>Class-component state → view-models → presentational components</i>"]

    API["<b>Control-plane / API</b><br/>draft CRUD · publish · routing<br/>connections · validation"]
    RT["<b>Realtime gateway</b><br/>subscribes Redis → push"]

    PG[("<b>Postgres (SoR)</b><br/>drafts/versions · routing policy<br/>run read-model · *_subscriptions<br/>connections(enc)")]
    S3[("<b>S3</b>")]
    KMS["KMS (wrap keys)"]
    REDIS["Redis bus"]
    SCHED["Temporal Schedules"]
    ING["<b>Event ingestion + matching</b><br/>dedup · subs"]
    WORK["<b>Temporal workers</b><br/>• interpreter workflow (walks DAG)<br/>• eval workflows (trigger filters)<br/>• scheduled dispatcher<br/>• activities: node exec, evaluate,<br/>recordProgress, enrichment"]

    FE -->|"REST/RPC (draft, publish, routing, conns)"| API
    RT -->|"SSE/WS (live run updates)"| FE

    API -->|desired state| PG
    API -->|reconcile| SCHED

    PG -->|large payloads| S3
    KMS -.->|wrap keys| S3

    SCHED --> WORK
    ING --> WORK
    WORK -->|"read-model writes (recordProgress activity)"| PG
    WORK -->|"publish (best-effort)"| REDIS
    REDIS -->|deltas| RT
```

## The load-bearing decisions, by domain

| Domain | Decision | ADR |
|---|---|---|
| Execution | Generic **interpreter** walks a pinned, immutable definition as data on Temporal | 0001 |
| State | **Temporal = orchestration, Postgres = system of record, S3 = blobs**; storage lane static per step type | 0002 |
| Conditions | Evaluated in an **`evaluate` activity** (no dual state); replay-safe via immutability + Temporal caching | 0003 |
| Reporting | **Postgres read-model** via idempotent `recordProgress`; **Redis bus** → SSE/WS; snapshot+deltas | 0004 |
| Failure | **Fail-fast**, binary status; **retry-from-failed** seeded from the read-model (same version) | 0005 |
| Triggers | Unified ingestion/matching; **desired-state reconciler**; durable **eval-workflow** for I/O filters | 0006 |
| Versioning | **Routing policy** `{live, canary?, weight, sticky_key}`; **sticky-by-key** canary, monotonic ramp | 0007 |
| Secrets | **Connections by id**, resolved JIT in activities, redacted everywhere; **KMS-envelope in Postgres** | 0008 |
| Node types | **Built-in catalog**; node type = **manifest + executor**; manifests served to UI; schema capped to latest; `retrySafe` | 0009 |
| Dynamic outputs | `output_spec` = static or **`from_config`** (config-derived outputs, e.g. document extractor); per-instance refs; broken refs block publish | 0014 |
| Expressions | **CEL substrate + structured-builder UI**; type-checked vs declared outputs; CEL canonical; `{{ <CEL> }}` interpolation | 0010 |
| Auth/tenancy | **Cognito = identity only**; memberships+roles in Postgres; **pool + RLS**; `org_id` into Temporal run context | 0011 |
| Persistence | **Hybrid graph** (JSONB + derived index); **event-sourced** read-model (`run_events` → projections); time-partitioned + tiered retention | 0012 |
| Reliability | **Effectively-once** 3-lever stack (deterministic `workflow_id`+dedup, read-model `seq`, `retrySafe`+idempotency keys); run timeout + `dead_letter_events` | 0013 |
| Topology | **Modular monolith** `apps/flow-backend`; role entrypoints (api/worker/ingestion/gateway/reconciler); worker task-queues split by workload class | 0015 |
| Stack | **Python + FastAPI**; `cel-python`; **SSE self-hosted gateway**; `temporalio`/SQLAlchemy/redis-py; OpenAPI → typed TS client | 0016 |

## Key flows

**1. Author → publish.** Editor → API writes draft to Postgres. Publish validates, snapshots an immutable version, updates the routing policy, and (scheduled) the reconciler converges a Temporal Schedule (`wf-{id}`). Trigger/connection rows are written in the same transaction.

```mermaid
sequenceDiagram
    actor Editor
    participant API as Control-plane / API
    participant PG as Postgres (SoR)
    participant Rec as Reconciler
    participant Temporal as Temporal Schedules

    Editor->>API: edit draft
    API->>PG: write draft
    Editor->>API: publish
    API->>API: validate
    API->>PG: snapshot immutable version + routing policy + trigger/connection rows (one txn)
    Note over Rec,Temporal: scheduled
    Rec->>PG: read desired state
    Rec->>Temporal: converge Schedule (wf-{id})
```

**2. Trigger → run start (version pinned for life).**
- *Scheduled:* Schedule → `startScheduledRun(workflow_id)` dispatcher → resolves `live_version` at fire-time → starts interpreter.
- *Event:* ingest → dedup(`event_id`) → structural match → **eval-workflow** (enrichment activities + filter via `evaluate`) → **sticky version select** → starts interpreter.

```mermaid
flowchart TB
    subgraph Scheduled
        S1["Schedule fires"] --> S2["startScheduledRun(workflow_id) dispatcher"]
        S2 --> S3["resolve live_version at fire-time"]
    end
    subgraph Event
        E1["ingest"] --> E2["dedup(event_id)"]
        E2 --> E3["structural match"]
        E3 --> E4["eval-workflow<br/>(enrichment activities + filter via evaluate)"]
        E4 --> E5["sticky version select"]
    end
    S3 --> INT["start interpreter<br/>(version pinned for life)"]
    E5 --> INT
```

**3. Execute.** The interpreter walks the DAG, dispatches each node as an activity; node outputs land in Postgres/S3; conditions call `evaluate`; every transition calls **`recordProgress`** (durable read-model write + best-effort Redis publish). Secrets resolve JIT inside activities, redacted from the read-model.

```mermaid
sequenceDiagram
    participant Int as Interpreter (walks DAG)
    participant Act as Activity (node exec)
    participant Store as Postgres / S3
    participant Eval as evaluate
    participant Redis as Redis bus

    loop each node / transition
        Int->>Act: dispatch node
        Act->>Act: resolve secrets JIT (redacted from read-model)
        Act->>Store: write node outputs
        opt condition node
            Int->>Eval: evaluate condition
        end
        Int->>Store: recordProgress (durable read-model write)
        Int-->>Redis: publish delta (best-effort)
    end
```

**4. Observe / recover.** UI snapshots the read-model on connect, then applies Redis deltas live. "Waiting" status and branch-taken are read-model columns. **Retry-from-failed** starts a new run on the same version, skipping succeeded nodes (reusing stored outputs), resuming at the failure.

```mermaid
sequenceDiagram
    actor UI
    participant Gateway as Realtime gateway
    participant PG as Postgres (read-model)
    participant Redis as Redis bus

    UI->>Gateway: connect
    Gateway->>PG: snapshot read-model
    PG-->>UI: snapshot (status, waiting, branch-taken)
    loop live
        Redis-->>Gateway: delta
        Gateway-->>UI: apply delta
    end
    Note over UI,PG: Retry-from-failed → new run, same version,<br/>skip succeeded nodes (reuse outputs), resume at failure
```

## Deployment topology (ADR-0015)

One build — **`apps/flow-backend`** (shared domain core) — launched as five independently-deployable role entrypoints:

```mermaid
flowchart LR
    CORE["<b>apps/flow-backend</b><br/>one build, shared domain core"]

    CORE -->|scale by request rate| API["<b>api</b><br/>sync HTTP: drafts/publish/routing/<br/>connections/validate"]
    CORE -->|scale by execution load<br/>worker-light / worker-heavy| WORKER["<b>worker</b><br/>Temporal workflows + activities<br/>task queues (config-driven via process args):<br/>• workflow (interpreter + eval decisions)<br/>• light-activity (recordProgress, evaluate, projection)<br/>• heavy-activity (LLM, HTTP, email, enrichment)"]
    CORE -->|scale by event volume| ING["<b>ingestion</b><br/>receive/dedup/match events, fan out"]
    CORE -->|scale by connected clients| GW["<b>gateway</b><br/>SSE/WS, Redis → browser<br/>(stateless via pub/sub)"]
    CORE -->|leader-elected singleton| REC["<b>reconciler</b><br/>desired-state → Temporal Schedules<br/>(+ periodic jobs)"]
```

`apps/flow-ui` (Next.js) is the separate frontend. Microservices are deferred — carve a role into its own service only when load demands.

## v1 scope

Ship a **linear + binary-condition** vocabulary (concrete steps + condition + filter + timed delay + schedule/event/webhook triggers + canary). **Defer** Parallel / Join / Map / in-graph event-Wait → so v1 runs a **single interpreter workflow** (no child workflows), and `wait_subscriptions` / sub-run drill-down are deferred. The general design accommodates these later without rework.

## Open / deferred (parking lot)

- Persistence schema consolidation / backend service topology.
- Reliability / idempotency hardening; scaling / tenant isolation.
- Concurrency vocabulary (Parallel/Join/Map), in-graph event-Wait correlation.
- Wait-vs-trigger fine details (exclusive-consume, dedup scope), pure/IO filter split optimization.
