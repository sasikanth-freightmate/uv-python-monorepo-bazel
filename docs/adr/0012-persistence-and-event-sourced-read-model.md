# ADR-0012: Persistence & event-sourced read-model

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter loads definition), ADR-0002 (state outside Temporal), ADR-0004 (read-model + Redis), ADR-0007 (immutable versions)
- **Refines:** ADR-0004 (the read-model is now event-sourced)

## Context

The first-pass data model (`../architecture/data-model.md`) made several storage choices unilaterally. Re-examined, four were load-bearing enough to record with rationale: how the graph is stored, whether the read-model is state-rows or an event log, partitioning/retention of high-volume tables, and read-model locality.

## Decision

### Graph storage = hybrid (JSONB canonical + derived index)

The workflow graph is one **JSONB `content`** document on drafts/versions — atomic, immutable-per-version (ADR-0007), and exactly what the interpreter loads (ADR-0001). A **derived index** (a `node_usages` table and/or a GIN index on the JSONB) serves cross-graph queries (node-type usage, connection references, impact analysis). Versions build the index once at publish; drafts rebuild on save.

### Read-model is event-sourced

An append-only **`run_events`** log is the canonical read-model: one immutable row per node transition, idempotent on `(run_id, node_path, seq)` and written by the Temporal-retried `recordProgress` activity. **`node_runs`** (per-node current state) and the **`runs`** rollup are **projections** of it. Each append simultaneously:

1. **is** the Redis delta (ADR-0004), 2) projects current state, 3) builds the per-node **timeline** for the trace (screen 8).

This refines ADR-0004's read-model from upserted state-rows to an event log + projections.

### Time-range partitioning + tiered retention

High-volume tables (`run_events`, `runs`, `node_runs`, `node_outputs`) are **time-range partitioned** (weekly/monthly); aging is a `DROP PARTITION`. **Tiered retention** (our policy, outlives Temporal): `run_events` short (~30–90d), `runs`/`node_runs` long (months/years), `node_outputs`/S3 shortest with S3 lifecycle (UI degrades to "payload expired"). Org sub-partitioning and cold archive are deferred.

### Read-model locality

Same Postgres for v1. The event-sourced log + Redis decoupling let `run_events`/projections lift to a read replica or a dedicated analytics store later with no rewrite. A separate CQRS store is deferred.

## Consequences

**Positive**

- Versioning stays trivial (hash the `content` doc) while cross-graph queries remain possible via the derived index.
- The event log gives a full execution timeline, unifies the live-delta path, and is append-only (no hot-row update contention) — mirroring Temporal's own event-sourced model.
- `DROP PARTITION` makes retention cheap; tiers keep verbose data short and summaries long.
- Read-model can scale out later without redesign.

**Negative / constraints**

- The derived `node_usages` index must be kept in sync with `content` (rebuild on publish/save).
- Projections add a moving part: `node_runs`/`runs` must be rebuilt from `run_events` (and be rebuildable for repair).
- Event log is higher storage volume than state-rows — mitigated by short retention + partitioning.
- Partitioning adds DDL/ops complexity (partition maintenance, planner considerations).

## Alternatives considered

- **Normalized `nodes`/`edges` tables** — rejected: painful immutable versioning (snapshot N rows), multi-row autosave, join-to-load; the hybrid index covers the query needs JSONB lacks.
- **State-rows only (upserted `node_runs`)** — rejected: discards the per-node timeline, and the event log aligns better with the existing Redis per-transition emission.
- **Separate read store now (CQRS/analytics DB)** — deferred: premature; the design is separable when reporting load demands.
