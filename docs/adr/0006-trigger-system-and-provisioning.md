# ADR-0006: Trigger system & dynamic provisioning

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter), ADR-0003 (eval-in-activity), ADR-0004 (read-model), versioning

## Context

Workflows start two ways (screen 5): **scheduled** and **event-based**. The defining constraint is that **workflows are data, not code** (ADR-0001) — only the generic interpreter type is registered with workers; user workflows exist only once **published**. So triggers cannot be statically wired at worker startup; they must be **dynamically provisioned at publish and removed at unpublish/archive**. This is a control-plane concern.

A related construct, the `Wait` node, also consumes events (it resumes a running workflow). Events that *start* workflows and events that *resume* waits share ingestion but differ in semantics.

## Decision

### Unified ingestion + matching, two subscription kinds

One ingestion/dedup/matching pipeline. Each event is matched against **both**:

- `trigger_subscriptions(workflow_id, version, source, event_type, filter)` → **StartWorkflow** (content predicate; matched by source+type+filter)
- `wait_subscriptions(run_id, execution_id, event_type, correlation_key, match_filter)` → **SignalWorkflow** (run-keyed; matched by type+correlation_key)

They are **not mutually exclusive** — one event can start new runs *and* resume waits. Differentiated structurally (trigger node vs `Wait` node) and by correlation key (unkeyed vs run-keyed). Shared plumbing, differentiated actions/access-patterns. (Fine details — exclusive-consume option, global vs per-subscription dedup — are backlog; leaning no-exclusive and global dedup by `event_id`.)

### Scheduled triggers — Temporal Schedules

One Temporal Schedule per workflow, deterministic id `wf-{workflow_id}`, action = start the interpreter with `(workflow_id, current_version)`. Overlap policy (Skip/BufferOne/AllowAll/CancelOther) is a **per-workflow setting**, default **Skip**, written into the Schedule spec. Timezone/DST, catchup, pause-on-failure come from Temporal Schedules.

### Provisioning — desired-state + reconciler (chosen: option c)

- Publish = **one transactional Postgres write** of desired state (includes `trigger_subscriptions` rows — strongly consistent, the event path needs no reconciler).
- Best-effort **immediate reconcile** of the workflow's Temporal Schedule for instant feedback.
- A **continuous reconciler** converges desired (Postgres) → actual (Temporal Schedules), heals drift, and rebuilds all Schedules on boot. The deterministic `wf-{workflow_id}` id makes convergence an idempotent upsert/delete.

This makes "workflows aren't known at worker startup" a non-issue: runtime trigger state is always derived from Postgres. Only the **scheduled path** needs reconciliation (the Temporal Schedule is the only external resource that can drift).

### Trigger filters — durable eval workflow (I/O-capable)

Trigger filters may call external systems to fetch/enrich data, so they are **not** pure predicates. Filter evaluation runs in a short-lived **Temporal eval workflow**, not at the edge:

```
event → ingest → dedup(event_id) → structural match (source,event_type)   [cheap, in-process]
         → EVAL WORKFLOW: enrichment activities (creds/retries/timeouts) + predicate via eval-in-activity (ADR-0003)
            → match → StartWorkflow(target, current_version, event)
            → no-match → complete, no target run created
```

This **unifies all expression evaluation into one path** (eval-in-activity for both in-run conditions and trigger filters) — the "portable expression engine" constraint disappears. Volume is bounded by the cheap edge pre-filter (only candidates spawn eval workflows), short-lived eval workflows, and no-match producing no run.

## Consequences

**Positive**

- Trigger state is fully derived from Postgres desired state; self-healing, restart-proof.
- One expression-evaluation path everywhere (eval-in-activity); enrichment fetches get Temporal retries/durability and credential-system access.
- Event-trigger and wait-resume share ingestion/dedup while staying semantically distinct.
- No-match events don't pollute run history (dedicated eval workflow vs self-gating target).

**Negative / constraints**

- An eval workflow per *candidate* event — must keep eval workflows short-lived and rely on the edge pre-filter to bound volume; not suited to high-frequency event streams without the pure/IO split optimization (backlog).
- A reconciler component to build and operate; brief eventual-consistency window between publish and Schedule existence (UI shows a provisioning state).
- Ingestion must implement at-least-once + dedup by `event_id`.

## Alternatives considered

- **Edge filter eval (portable pure engine)** — viable only while filters are pure; rejected because filters need external I/O.
- **Self-gating target workflow** (start target always, gate in its first step) — rejected: pollutes run history with no-op runs.
- **Synchronous-only provisioning** (option a) — rejected: dual-write drift, publish latency coupled to Temporal.
- **Reconciler-only** (option b) — rejected in favor of (c) for snappy publish feedback.
- **Separate pipelines for trigger-start vs wait-resume** — rejected: duplicates sources/dedup/retries; unified pipeline with two subscription tables is DRY.
