# ADR-0005: Run failure handling & recovery (fail-fast + retry-from-failed)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter), ADR-0002 (run state storage), ADR-0004 (read-model), versioning

## Context

The execution engine runs branching workflows with concurrent sub-graphs (Parallel branches, Map items). We need a defined behavior when a node fails, and a recovery story so that a failure does not force re-running an entire (possibly long/expensive) workflow from scratch.

Two design axes:

1. **Failure propagation** — what happens to the run when a node fails.
2. **Recovery** — whether and how a user can resume a failed run.

## Decision

### Fail-fast

A **definitively-failed node fails the whole run**; in-flight siblings (other Parallel branches / Map items) are **cancelled**. "Definitively failed" means *after* the node's own Temporal activity **retry policy is exhausted** — per-node retry/backoff still applies beneath this.

The run status model stays **binary** (Success / Failed, plus transient Running / Waiting). No "completed with errors" state. Partial-failure semantics are deliberately *not* introduced.

Cancelled siblings are recorded as **`node_runs.status = cancelled`** (distinct from `failed`) and rendered distinctly in the trace (dimmed, not red) so the single real failure remains the focal point.

### Recovery: retry-from-failed (Case A only)

Support **"retry from the failed node" on the same immutable version**, reusing durable upstream outputs. This is feasible without Temporal Reset or history retention because all succeeded node outputs are already in Postgres/S3 (ADR-0002), keyed by `run_id + node_path`.

Mechanism: start a **new interpreter run on the same pinned version**, seeded from the prior run's read-model. The interpreter **skips nodes already marked `succeeded`** (reads their stored output) and **resumes real execution at the failed node** forward. The new run is linked as a retry (`retry_of: <run_id>`) for lineage in history/trace.

UI: a **"Retry from here"** action on the failed node in the Run Detail screen.

**Explicitly out of scope:**

- **Case B (edited workflow) is NOT a resume.** Editing creates a new version; prior outputs were produced by the old definition and grafting them onto a structurally-different version is unsafe. The path is fix → publish → run from the trigger (a fresh run), which "Open in editor" already leads to.
- **Rerun-from-any-node** — deferred (cheap to add later on the same machinery; omitted from v1 to avoid output-provenance confusion).

## Consequences

**Positive**

- Binary status model stays honest; the trace always has exactly one focal failure.
- Recovery is clean and engine-agnostic: a seeded new run, no Temporal Reset, no dependence on (short-lived) Temporal history retention.
- Per-node retry/backoff (Temporal activity retry policy) is unaffected and sits beneath fail-fast.

**Negative / constraints**

- Retry-from-failed **re-executes the failed node**, so that node must be **retry-safe** (at-least-once / idempotency). Treated as a **node-type contract** (side-effecting nodes should support an idempotency key); enforcement deferred to the node-type system, risk documented now.
- A retry produces a new `run_id` linked to the original — history/trace must present the lineage so users aren't confused by "two runs."

## Alternatives considered

- **Collect partial failures / "completed with errors" status** — rejected: forces a richer status model the UI pills don't express; chose graph-level handling + binary status.
- **Node-level on-error edges** — deferred (could layer on later as an opt-in per node).
- **Temporal Reset for recovery** — rejected: event-level (not node-level), bound by history retention, and awkward across the child-workflow tree; seeded-resume from the external read-model is cleaner.
