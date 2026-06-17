# ADR-0004: Run read-model & real-time reporting projection

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter), ADR-0002 (run state storage), ADR-0003 (condition evaluation)

## Context

We checked whether the execution-tracking UI (dashboard health, run history, the execution trace) could be served by Temporal's APIs alone. It cannot. Temporal is strong for **execution lifecycle and lineage** but has five gaps against the UI requirements:

1. **No "Waiting" status** — a `Wait` node is a *Running* workflow blocked on a signal; the amber "Waiting" pill (screens 7, 8) is an application concept.
2. **History retention** — closed workflow histories are deleted after the retention window; screen 7 ("every run ever") must outlive that.
3. **No push/subscribe API** — every "updates live" requirement (running dots, animated trace) needs our own push layer.
4. **No per-node / branch / I/O model** — `GetWorkflowExecutionHistory` returns low-level Temporal events, not the `Send Email → output → messageId` node graph; mapping events back to nodes is fragile and child detail lives in separate histories.
5. **No clean per-workflow aggregates** for dashboard health.

Temporal *does* natively provide: execution status (Running/Completed/Failed/Canceled/Terminated/TimedOut), start/close time, parent→child execution tree, and Search-Attribute filtering (with Advanced Visibility).

## Decision

Introduce a **run read-model in Postgres** that the interpreter populates as it walks the graph, plus a **Redis bus** for real-time fan-out. Temporal remains the engine + lineage tree; the UI never queries Temporal for node detail.

**Read-model (Postgres), minimum shape**

- `runs` — run-level summary: `run_id, workflow_id, version, status, trigger_kind, started_at, finished_at, duration`. Indexed `(workflow_id, started_at DESC)` for history lists and dashboard health.
- `node_runs` — per-node, per-run: `run_id, node_path, node_type, status, input_ref, output_ref, error, started_at, finished_at, taken_edge_id, waiting_for`. `node_path` is the hierarchical address (e.g. `map[item=42].sendEmail`) shared across child workflows under one `run_id`.

Run-level status is a **rollup** of `node_runs` (any `waiting` → Waiting; any `failed` and halted → Failed; all terminal-ok → Success; else Running). "Waiting" and "branch taken" are simply columns we write — closing gaps 1 and 4. Retention is **ours** (gap 2); S3 payloads may be lifecycle-expired on a shorter clock with the UI degrading to "payload expired".

**Write path — durable via Temporal**

Each node transition is recorded through an **idempotent `recordProgress(run_id, node_path, transition)` activity**. Because it is an activity, Temporal retries it until it succeeds, so the read-model **converges to actual execution** even across worker crashes. The activity upserts (keyed by `run_id + node_path + transition`) so retries never double-write.

**Live path — Redis bus from day one (best-effort)**

After the durable upsert, the activity **publishes a delta to a Redis channel `run:{run_id}`** (best-effort — a publish failure does not fail the activity and is not retried for its own sake). A realtime gateway subscribes to Redis and pushes deltas to browsers over SSE/WebSocket, scoped to the run being viewed.

**Client contract: snapshot + deltas.** On connect (and reconnect), the client fetches the current state from the read-model, then applies live deltas from the stream. This makes the best-effort Redis publish safe: any missed delta is reconciled by the next snapshot.

```
Interpreter (Temporal)
   │ each transition → recordProgress() activity   (Temporal-retried ⇒ durable read-model)
   ▼                              │ best-effort publish
Postgres read-model (runs, node_runs)  ──► Redis `run:{id}` ──► realtime gateway ──► UI (SSE/WS)
   ▲                                                                                   │
   └────────────────── snapshot on connect / reconnect ────────────────────────────────┘
```

## Consequences

**Positive**

- Closes all five gaps; the UI is served entirely by the read-model.
- Read-model consistency is guaranteed by Temporal's activity retries (no bespoke reconciliation loop).
- Redis publish being best-effort keeps the hot path cheap; correctness rests on the durable read-model + snapshot-on-connect.
- True push from day one matches the spec's "live/animated" requirements.

**Negative / constraints**

- A new always-on dependency (Redis) and a realtime gateway service to operate.
- Read-model is **eventually consistent** — the UI may lag execution by a beat (acceptable, and honest).
- Dual representation (Temporal history + Postgres read-model); the read-model is for humans/UI, Temporal history for engine/replay/audit. They are reconciled by writing the read-model through retried activities, not by querying one from the other.

## Alternatives considered

- **Serve UI from Temporal APIs (Visibility/History/Query)** — rejected: cannot provide Waiting status, long-term history, per-node I/O, or live push.
- **v1 SSE backed by server-side polling, Redis later** — considered; rejected in favor of the Redis bus from the start (chosen by the team) so the live path is real push immediately.
- **Postgres `LISTEN/NOTIFY` instead of Redis** — viable but capped on payload/fan-out and couples realtime to the primary DB; Redis decouples fan-out and scales subscribers independently.
