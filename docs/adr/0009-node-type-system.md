# ADR-0009: Node-type system (built-in registry)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0002 (storage lane), ADR-0003 (declared outputs / references), ADR-0005 (idempotency / retry), ADR-0007 (version immutability)
- **Amended by:** ADR-0014 (manifest `output_schema` → `output_spec`: static or config-derived), ADR-0013 (idempotency-key pass-through)

## Context

The frontend currently hardcodes node metadata, config-form schemas, and output schemas (`NODE_DEFS` / `FIELD_DEFS` / `OUTPUT_FIELDS`). The engine, validation, and UI all need one shared definition of each node type. Node types also own two contracts deferred earlier: the static storage lane (ADR-0002) and the idempotency contract (ADR-0005).

## Decision

### Built-in catalog only (v1)

Node types are a fixed set authored by us; executors are compiled into the workers. Manifests are served from a registry, but no external/customer-authored types — no plugin SDK, no sandboxing, no untrusted-code story. Extensibility is a v2+ platform bet.

### Node type = manifest + executor, keyed by `type_id`

- **Manifest** (declarative data, served to UI + used by validation):
  - display metadata (title, icon, category)
  - **config-field schema** (replaces `FIELD_DEFS`)
  - **declared output schema** (replaces `OUTPUT_FIELDS`; the autocomplete/reference source — ADR-0003)
  - **storage lane** — Postgres or S3 for this type's output (ADR-0002)
  - **`retrySafe`** boolean (idempotency, below)
- **Executor** — the worker activity the interpreter invokes for nodes of this type.

The frontend **fetches manifests from the registry** instead of hardcoding them — engine, validation, and UI read one source of truth.

### Schema capped to latest only

One current schema per `type_id`; **no historical manifest/executor retention**. Old immutable workflow versions **may not render or run** if their node type's schema later changed.

This **qualifies ADR-0007's immutability guarantee:** the *definition* is immutable, but its node-type *manifest/executor is not versioned*, so an old version is **not fully self-contained**. Mitigations:

- Prefer **additive / backward-compatible** manifest changes by convention; make breaking changes (rename/remove a field, change an output) rare and reviewed.
- The editor **degrades gracefully** ("this step uses an outdated configuration") rather than crashing when an old version's config no longer matches the current manifest.

### Idempotency = `retrySafe` flag only

The manifest carries a `retrySafe` boolean. It gates whether **"Retry from here"** (ADR-0005) is offered for that node. Actual side-effect deduplication is the executor's responsibility; no idempotency-key-template machinery in v1.

## Consequences

**Positive**

- Single source of truth for node definitions; frontend gap #6 closed.
- No sandboxing/SDK/marketplace surface to build for v1.
- Storage lane and `retrySafe` live with the type that owns them, consumed by the engine, validation, and UI uniformly.

**Negative / constraints**

- Capping schema means old workflow versions are not guaranteed to render/run after a breaking node-type change — an explicit, accepted limitation that weakens ADR-0007's "old versions always work."
- Discipline required: breaking manifest changes need review; the editor must implement graceful degradation.
- `retrySafe`-only idempotency means executors that touch non-idempotent external APIs carry the dedup burden themselves.
- Built-in-only limits the catalog to our throughput until extensibility ships.

## Alternatives considered

- **Pluggable node types** — deferred to v2+: sandboxing, SDK, per-tenant isolation, and marketplace are months of work not needed for v1's curated-catalog value.
- **Versioned node-type schemas (retain historical manifests/executors)** — rejected for v1 in favor of latest-only simplicity; revisit if "old versions must always render/run" becomes a hard requirement.
- **Idempotency-key expression in the manifest** — deferred; `retrySafe` boolean is enough to gate retry and keep executors responsible for dedup.
