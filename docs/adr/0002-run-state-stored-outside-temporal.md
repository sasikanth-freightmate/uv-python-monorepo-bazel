# ADR-0002: Run state stored outside Temporal (Postgres + S3)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter), ADR-0003 (condition evaluation)

## Context

The interpreter (ADR-0001) accumulates node outputs as the run progresses. Temporal workflow history has hard limits (event count, payload sizes), so accumulating all node outputs in workflow state would cap how much data a workflow can handle (e.g. a large `Map`, or a step returning a multi-MB payload would blow up the run).

Separately, the Run Detail / execution-trace screen needs per-node **resolved input and output** for debugging — a queryable record, not something that must be reconstructed from Temporal history.

## Decision

**Temporal holds only orchestration truth** (which node is current, control-flow position, activity results needed for replay). **Canonical run data lives outside Temporal:**

- **Postgres** is the system of record for run rows and per-node input/output.
- **S3** holds large payloads, referenced by key.
- **Temporal workflow memory carries pointers/references, not payloads.**

**Storage lane is declared statically per step type.** The node-type author decides whether that step's output lands in Postgres (small, structured) or S3 (known-bulky), because they know the payload shape. This is a deliberate, documented choice per step type — not a global rule and not a runtime size-threshold spill.

## Consequences

**Positive**

- Run data size is bounded by Postgres/S3, not Temporal history limits.
- Clean separation: "what happened" (Temporal) vs. "the data it produced" (Postgres/S3).
- Directly feeds the Run Detail screen — the trace reads Postgres, not Temporal history.
- Single source of truth for run data (no promoted copies inside workflow state).

**Negative / constraints**

- Reading run data for control flow requires I/O, so condition evaluation cannot happen in deterministic workflow code — resolved by ADR-0003.
- Static lanes mean a generic step (e.g. HTTP) whose response size is unknown must pessimistically pick S3, adding a fetch hop even for small responses. Accepted in exchange for predictable, debuggable placement (a node's output is always in the same store across runs).
- Node-type authors carry responsibility for choosing the lane correctly; this must be part of the node-type authoring guidelines.

## Alternatives considered

- **Inline all state in Temporal** — rejected: caps workflow data size at Temporal history limits.
- **Dynamic size-threshold spill (≤256KB → Postgres else S3)** — rejected: a node's output location would vary run-to-run, complicating debugging and the trace UI; chose predictability over optimal placement.
- **Promotion layer (small scalars copied into workflow memory)** — rejected: introduces a dual-state/source-of-truth problem (see ADR-0003).
