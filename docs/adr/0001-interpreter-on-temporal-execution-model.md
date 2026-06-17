# ADR-0001: Interpreter-on-Temporal execution model

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0002 (run state storage), ADR-0003 (condition evaluation)

## Context

The product lets users assemble branching workflows on a visual canvas (steps, branches, parallel/join, map, loop, wait) and run them. Execution runs on Temporal, which is already in the stack. A published workflow must become a durable, recoverable execution.

There are three families for turning a visual graph into a running execution:

- **Interpreter** — one generic Temporal workflow type loads the graph as data and walks it at runtime, dispatching nodes as activities. (cf. n8n's data-driven graph, Temporal's DSL-interpreter sample.)
- **Compiler / codegen** — each published workflow compiles to Temporal workflow code that is built and deployed per workflow.
- **Declarative state machine** — the graph serializes to a spec stepped through by a hosted engine (cf. AWS Step Functions / ASL).

## Decision

Use the **interpreter** model: a single generic Temporal workflow type loads a **pinned, immutable workflow definition** (see versioning) as data and traverses the graph, invoking node behavior as activities.

## Consequences

**Positive**

- No per-workflow build/deploy pipeline — publishing a workflow is a data write.
- A draft can be executed for testing with zero extra machinery (same interpreter, draft definition).
- One worker fleet and one workflow type to operate, observe, and scale.

**Negative / constraints**

- The interpreter must preserve Temporal determinism: graph traversal/control-flow logic lives in deterministic workflow code; anything touching the world is an activity. This boundary is the subject of ADR-0003.
- A bug in the interpreter affects all workflows (shared blast radius) — mitigated by versioning the interpreter and pinning definitions.
- Performance ceiling is the interpreter's, not hand-tuned per-workflow code (acceptable for SaaS-step orchestration; revisit if hot-path latency becomes a goal).

## Alternatives considered

- **Codegen** — rejected: forces a build/deploy per publish, makes "run the draft" hard, and overkill for non-engineer self-serve.
- **Declarative state machine (hosted)** — rejected: we already have Temporal; adding a second engine duplicates durability concerns.

### Durable-execution engine: Temporal vs Restate

Restate was evaluated as an alternative durable-execution engine. Most of our architecture is engine-agnostic (ADR-0002 external state, ADR-0004 read-model + Redis, ADR-0005 fail-fast + seeded retry, the `wait_subscriptions` correlation table) and would survive either choice — only this ADR and the child-workflow lineage are Temporal-shaped.

**Kept Temporal** because the two dimensions where it leads are directly load-bearing for the spec:

- **Child-workflow lineage tree** — gives the Map/Parallel per-item/per-branch sub-runs (Run Detail, screen 8) almost for free.
- **Mature Schedules API** — needed for scheduled triggers.

Plus maturity, observability/Web UI, and existing investment (already in the repo).

**Restate's advantages** (simpler operations — single binary vs a cluster; and Virtual Objects keyed by correlation id + awakeables, an elegant fit for keyed event correlation) were judged insufficient to switch: correlation is already solved cleanly by the subscription table (which doubles as the trigger index), neutralizing Restate's standout fit.

**Revisit if:** operational simplicity becomes a hard constraint, or workloads become dominated by keyed, event-correlated stateful entities (Restate's home turf). If seriously reconsidered, spike two things first: parent→child sub-run lineage, and scheduled-trigger ergonomics.
