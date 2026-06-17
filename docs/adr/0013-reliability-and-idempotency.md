# ADR-0013: Reliability & idempotency

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0003 (eval-in-activity), ADR-0005 (fail-fast/retry), ADR-0006 (ingestion/dedup), ADR-0009 (retrySafe), ADR-0012 (read-model)
- **Amends:** ADR-0009 (manifest/executor gains a system-derived idempotency key pass-through)

## Context

Temporal provides **at-least-once** activity execution — an activity can run more than once, most dangerously when it completes a side effect and the worker crashes before reporting completion. Exactly-once is impossible in general; the goal is **effectively-once via idempotency**. Separately, we need to bound runs stuck in retry and ensure poison events never vanish silently.

## Decision

### Effectively-once: a 3-lever idempotency stack

1. **Run creation** — trigger-started runs use a **deterministic `workflow_id`** (e.g. `hash(workflow_id, event_id)`); Temporal rejects duplicates. Combined with `processed_events` (**atomic insert-on-unique `event_id`**), a duplicate delivery cannot start two runs.
2. **Read-model** — idempotent append on `(run_id, node_path, seq)` (ADR-0012).
3. **Side-effecting executors — (a)+(b):**
   - **(a)** `retrySafe` remains the honest flag and gates whether "Retry from here" (ADR-0005) is offered.
   - **(b)** a **system-derived per-node idempotency key** (`hash(run_id, node_path)`) is passed through to cooperating external APIs (idempotency header) → effectively-once where the downstream cooperates.
   - Where an API does **not** support idempotency, behavior is documented **at-least-once**. The key is **system-derived, not author-configured** (keeps the ADR-0009 manifest light).

### Stuck runs & poison events — minimal app-side

- **Run-level execution timeout** (Temporal workflow timeout) so nothing runs forever; on expiry the run fails (fail-fast, ADR-0005).
- **`dead_letter_events`** table: events that exhaust eval-workflow retries land here with a basic alert, so deliveries never vanish silently.
- **Admin-cancel reuses the existing run-cancel** path (the UI already cancels runs).
- A full ops console is **deferred**; zombie waits are mostly post-v1 (v1 has only bounded `delay`, not unbounded in-graph `Wait`).

## Consequences

**Positive**

- Double-triggering is structurally closed (deterministic `workflow_id` + unique `event_id`).
- Side effects are effectively-once with cooperating APIs; the failure mode elsewhere is explicit and documented, not hidden.
- "Runs forever" and "events disappear" — the two failures that actually bite — are closed with minimal build.

**Negative / constraints**

- At-least-once remains for non-cooperating external APIs; executor authors must understand the contract.
- The idempotency key must be derived identically wherever an executor runs (shared helper).
- Minimal tooling means ops leans on the Temporal Web UI + the DLQ table until a console is built.

## Alternatives considered

- **Side-effect ledger for lever 3** — narrows but cannot close the crash-between-call-and-ledger window; rejected as added cost for partial benefit.
- **Author-configured idempotency-key templates** — deferred; system-derived keys suffice and keep manifests simple.
- **Full ops tooling (DLQ + alerting + admin console) now** — deferred to post-v1.
- **Temporal-only (no app-side handling)** — rejected: events exhausting retries would vanish without a DLQ.
