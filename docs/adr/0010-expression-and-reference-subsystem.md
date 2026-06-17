# ADR-0010: Expression & reference subsystem (CEL + structured builder)

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0003 (eval-in-activity), ADR-0006 (trigger filters), ADR-0007 (sticky key), ADR-0009 (declared output manifests)
- **Amended by:** ADR-0014 (reference resolution is per-instance for config-derived outputs; broken refs are publish-blocking)

## Context

Expressions appear across the product: in-run conditions (0003), trigger filters (0006), the sticky-key for canary (0007), reference-mode config fields, and `{{ }}` token interpolation in string fields. Requirements gathered: structured/guardrailed authoring, **compound logic** (`A AND (B OR C)`), **function calls**, reference resolution against declared outputs, **type-checking**, and a **portable, pure, deterministic** evaluator (must run inside the `evaluate` activity and be replay-safe).

Hand-rolling a structured model + function registry + type-checker + cross-runtime consistency is effectively reinventing an expression language. CEL (Common Expression Language) already provides all of it: functions (string/list/math/timestamp), compound logic, references, static type-checking, and is pure / deterministic / non-Turing-complete / sandboxed, with implementations in multiple languages.

## Decision

### CEL is the evaluation substrate; the structured builder is the UI

- **CEL** is the canonical expression representation and evaluator. It satisfies the eval-in-activity (0003) and portability (0006) requirements directly (pure, deterministic, sandboxed).
- The **structured builder** (the screen-6 component: AND/OR groups of `{field, operator, value}` leaves, dropdown-driven) is the default, guardrailed authoring UI. It **emits CEL** underneath.
- A **raw-CEL "advanced" mode** is available for power users who exceed the builder's structural subset.

### Shared reference-resolution + type-check core

- References (`slug.field.path`, `event.…`) resolve against **node-type declared-output manifests** (ADR-0009) plus the trigger event.
- CEL **static type-checking** runs against those schemas → screen 6's valid/invalid is a genuine type-check (unknown field, type mismatch), not a hand-rolled validator.
- **Sticky-key** (0007) is a single CEL reference expression.
- **Token interpolation** is a thin templating layer: a string with `{{ <CEL> }}` holes, each evaluated and stringified — reusing the same evaluator and reference resolution. (Keeps the frontend's existing `{{ }}` UX.)

### Canonical storage = CEL

- The **CEL string is the source of truth** — what gets stored in the definition, evaluated, and type-checked.
- The structured builder **parses the subset it understands** to render the dropdown UI; expressions beyond that subset (raw CEL) display as **advanced / read-only** in the builder rather than being lost.

### Functions vs. enrichment (reconciles ADR-0006)

CEL functions cover pure transforms (string/list/math/time). **External data still comes from enrichment activities**, not expression functions: the trigger eval-workflow (0006) enriches first (adds fields via activities), then the CEL predicate runs over the enriched fields. Logic = CEL; I/O = activities.

### Validation runtimes

- **Authoritative type-check is server-side** (a `validate` endpoint) so a single CEL implementation/type-environment is the source of truth.
- The frontend may do **lightweight syntax/reference hints** for live feedback, with the server check authoritative on blur/save — avoiding two fully-synced CEL implementations.

## Consequences

**Positive**

- Functions, compound logic, and real type-checking without building/maintaining a language.
- One pure, deterministic, sandboxed evaluator that drops into the `evaluate` activity and is replay-safe.
- Structured builder keeps authoring guardrailed for the common case; advanced mode prevents a hard ceiling.
- Token interpolation, conditions, filters, and sticky-key all share one resolution + evaluation core.

**Negative / constraints**

- New dependency on a CEL implementation; need it in the worker runtime (eval) and a validation path (server-side `validate`).
- Structured-builder ⇄ CEL mapping is asymmetric: emitting CEL is easy; parsing arbitrary CEL back into the builder is limited (raw CEL → advanced/read-only).
- A custom function library (if we add freight-specific helpers) must be registered identically wherever CEL runs.

## Alternatives considered

- **Structured-only rule tree (no functions)** — rejected: the function requirement makes it insufficient.
- **Hand-rolled structured + function registry + type-checker** — rejected: reinvents CEL; type-checking and safety are the costly parts.
- **JSONLogic** — simpler and JSON-native, but weaker type-checking and a smaller function set; CEL's type system and safety profile fit better.
- **Store the structured tree, compile to CEL** — rejected in favor of CEL-canonical so power users exceeding the builder aren't unrepresentable.
