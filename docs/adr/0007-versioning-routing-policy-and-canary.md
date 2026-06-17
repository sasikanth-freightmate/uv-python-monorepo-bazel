# ADR-0007: Versioning routing policy & canary (sticky traffic-splitting)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter / version pinning), ADR-0004 (read-model), ADR-0005 (run pinning), ADR-0006 (trigger system & provisioning)
- **Amends:** the single `current_version` pointer implied by ADR-0001/versioning

## Context

The frontend already models **progressive rollout / canary**: a candidate version (e.g. v4) takes a share of traffic alongside the live version (e.g. v3), with metrics comparison, promote, and rollback. This is a real product capability, not aspirational.

A single `current_version` pointer cannot express "two active versions at once." And because a run is pinned to one version for its lifetime (ADR-0005), the split decision must happen **at run-start**, before `StartWorkflow`.

## Decision

### Routing policy replaces the single pointer

A workflow's version selection generalizes from `current_version` to a **routing policy**:

```
{ live_version, canary_version?, canary_weight%, sticky_key_expr? }
```

- No canary → 100% of new runs use `live_version`.
- Canary present → `canary_weight%` of new runs use `canary_version`, the rest `live_version`.

Stored in Postgres (workflow routing row); promote/rollback/set-weight update it transactionally. In-flight runs are unaffected (already pinned, ADR-0005); routing changes apply only to **new** runs.

### Sticky-by-key assignment (event workflows)

Version is chosen deterministically by entity:

```
bucket = stableHash(eval(sticky_key_expr, event)) % 100
version = (canary_version && bucket < canary_weight) ? canary_version : live_version
```

- `sticky_key_expr` is an **author-specified expression over the trigger event** (e.g. `event.shipment.customer_id`), chosen in the canary config, reusing the expression engine.
- The **same entity always lands on the same version** — consistent behavior across runs, independent of run time.
- **Ramping is monotonic:** raising `canary_weight` only moves *more* entities into canary; it never flips an entity canary→live→canary. Rollback ramps down cleanly. No flip-flopping.
- The hash MUST be a **single fixed, shared implementation** across every run-start site so the bucket is computed identically everywhere (same portability discipline as the expression engine).

### Scheduled workflows: no canary in v1

A scheduled run has no per-run entity to hash, so sticky-by-key does not apply. **Scheduled workflows do not support canary in v1** — they publish straight to `live_version`. (Random-per-fire and all-or-nothing weighting were considered and deferred.)

### Run-start version selection

Version selection is a step in the run-start path, before pinning:

- **Event path** — the ingestion/eval-workflow computes the sticky bucket and starts the interpreter pinned to the chosen version.
- **Scheduled path** — the Temporal Schedule targets a thin **dispatcher** `startScheduledRun(workflow_id)` that resolves `live_version` at fire-time and starts the interpreter. Because the dispatcher resolves the version at fire-time, **promote/rollback and weight changes need no Schedule reconciliation** — they take effect on the next run.

### Metrics, promote, rollback

- Canary metrics (success rate, duration, sample size) come **free** from the read-model: `runs` grouped by `version_id` (ADR-0004 records version per run). No new infra.
- **Promote** → `canary_version` becomes `live_version`; canary cleared; new runs all use it.
- **Rollback** → discard `canary_version`; `live_version` unchanged.

## Consequences

**Positive**

- Expresses two-active-versions cleanly; promote/rollback are simple routing-policy updates.
- Sticky monotonic assignment gives coherent per-entity behavior and safe ramping.
- Dispatcher indirection decouples Schedule lifecycle from version changes (no reconciliation on promote/weight change).
- Metrics are a read-model query — no extra pipeline.
- In-flight runs immune (pinning, ADR-0005).

**Negative / constraints**

- The hash/bucketing must be a shared, versioned, deterministic function across all run-start sites; drift would misroute entities.
- Sticky key requires the author to choose a stable identity expression; a poor key (low cardinality, or absent on some events) degrades the split.
- Scheduled canary is unavailable in v1 (acceptable — canary targets high-volume event workflows).
- Routing policy is another piece of desired state the control plane must store and (for the dispatcher target) keep consistent.

## Alternatives considered

- **Single `current_version` pointer** — rejected: cannot express simultaneous live + canary.
- **Random per-run splitting** — rejected in favor of sticky-by-key for per-entity consistency and monotonic ramping.
- **Scheduled canary via random-per-fire / all-or-nothing** — deferred; not v1.
- **Schedule targets a fixed version directly** — rejected: every promote would require Schedule reconciliation; the dispatcher avoids it.
