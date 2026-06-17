# ADR-0014: Dynamic (config-derived) node outputs

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Amends:** ADR-0009 (manifest `output_schema`), ADR-0010 (reference resolution & validation)

## Context

ADR-0009 modeled a node type's output schema as **static** — declared once in the manifest and used by ADR-0010 for references/autocomplete/type-checking. Some node types produce outputs that depend on the **node instance's configuration**, not the type. Canonical example: a **document extractor** configured with N user-defined fields, each `{name, type, prompt}`, producing exactly those fields. Its outputs are unknowable from the type alone.

## Decision

### Output schema becomes an output *spec* (static or config-derived)

A manifest's output schema generalizes to an **`output_spec`**, one of:

- **`static`** — a fixed list of `{path, type}` (the prior behavior; e.g. Send Email → `messageId`, `status`).
- **`from_config`** — a **declarative rule** projecting a repeatable config field into outputs: e.g. "outputs come from `config.fields[]`, `path = entry.name`, `type = entry.type`." The document extractor's `fields[]` (`{name, type, prompt}`) yields outputs `extractor.<name>` typed by `entry.type`.

`static` is the trivial case of the general resolver. **`from_config` is declarative** so the **frontend computes a node's outputs locally** from its config (no backend round-trip), and validation/type-checking stay straightforward.

A **code resolver** (`outputSchema(config)` function, backend-resolved) is **deferred** as an escape hatch for outputs that aren't a straight projection of a config list.

### Reference resolution is per-instance (amends ADR-0010)

The reference/autocomplete/type environment for a downstream node computes an upstream node's outputs **from that upstream node's config** (for `from_config` nodes), not a static type schema. The frontend's per-type `OUTPUT_FIELDS` becomes per-instance for dynamic nodes.

### Broken references are publish-blocking errors

When an upstream dynamic field is renamed/removed and a downstream node still references it (`extractor.old_field`):

- It shows **live as invalid (red)** in the expression builder while editing (screen 6).
- It is a **publish-blocking error** at validation (screen 9 — *"refers to an output that no longer exists"*).

A dangling reference is **incorrect**, not merely risky — so it blocks publish, unlike the amber author's-risk warnings (e.g. unbounded waits).

## Consequences

**Positive**

- Supports configurable-output nodes (document extractor, JSON-parse-with-schema, custom HTTP with declared response fields) without a redesign.
- Declarative `from_config` keeps output derivation local to the UI — instant autocomplete/validation, no round-trip.
- Everything downstream stays intact: storage lane (0002), eval-in-activity (0003), versioning (the configured fields live in the immutable version `content`).

**Negative / constraints**

- Validation must **re-check downstream references when an upstream node's config changes** (the new behavior to implement carefully).
- The CEL type environment (0010) is now partly instance-derived; the type-checker resolves it from configured fields.
- Truly arbitrary output shapes need the deferred code resolver.

## Alternatives considered

- **Keep outputs static per type** — rejected: cannot express configurable-output nodes.
- **Code resolver (`outputSchema(config)`) now** — deferred: a round-trip and more machinery than the document-extractor case needs; declarative `from_config` covers it.
- **Broken reference as amber warning** — rejected: a dangling reference is a correctness error (and the spec lists it as a red error on screen 9).
