# ADR-0003: Condition / expression evaluation via activity

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter), ADR-0002 (run state storage)
- **Supersedes:** the earlier "conditions are pure / evaluated in deterministic workflow code" proposal

## Context

The interpreter (ADR-0001) must evaluate branch conditions and reference-mode expressions (the screen-6 expression builder) to decide traversal. Run data lives in Postgres/S3 (ADR-0002), which deterministic workflow code cannot read (I/O is non-deterministic under Temporal replay).

Two reconciliations were considered:

1. **Pure-with-promotion** — producing activities copy small scalar outputs into workflow memory; conditions read only those promoted fields. Keeps evaluation in workflow code but creates a second copy of state (promotion layer) and limits conditions to promoted scalars.
2. **Eval-in-activity** — condition/expression evaluation runs in an activity that fetches the referenced output from Postgres/S3 and returns the result.

## Decision

Evaluate conditions and expressions in a dedicated **`evaluate` activity**. The workflow holds only pointers; when control flow needs a value, it calls the activity, which fetches the referenced step output (Postgres or S3) and returns the evaluated result.

This is replay-safe for two independent reasons:

1. **Immutability** — a step's output never changes once produced, so re-fetching always yields the same value.
2. **Temporal semantics (the stronger guarantee)** — Temporal records the activity *result* in history and, on replay, returns the recorded value instead of re-running the activity.

## Consequences

**Positive**

- Eliminates the promotion / dual-state layer entirely — single source of truth (ADR-0002).
- Conditions can reference the **full** output of an earlier step, not just promoted scalars.
- No special-casing between "small scalar" and "deep/blob" references in the expression language.

**Negative / constraints**

- Each condition costs an activity round-trip and a Temporal history event. **High-iteration `Loop` nodes and conditions inside hot paths can grow history** — needs a guard (e.g. bounded loop counts, batching multiple expressions per `evaluate` call, or caching a fetched output within the run for reuse).
- Branch evaluation is no longer zero-latency; acceptable for SaaS-step orchestration cadence.

## Alternatives considered

- **Pure-with-promotion** — rejected: introduces a dual-state/source-of-truth problem and restricts conditions to promoted scalar fields.
- **Hybrid by reference depth** (scalars in-workflow, blobs via activity) — rejected: two evaluation paths to build and reason about; "why is this branch slow?" becomes opaque.
