---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Clean Architecture and Domain-Driven Design guidelines for Python services'
session_goals: 'Define folder/module structure conventions, layer boundaries (domain/application/infrastructure), Python patterns for repositories/use cases/aggregates, and reusable team guidelines'
selected_approach: 'ai-recommended'
techniques_used: ['Assumption Reversal', 'Morphological Analysis', 'Cross-Pollination']
ideas_generated: 14
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Sasikanth
**Date:** 2026-06-17

## Session Overview

**Topic:** Clean Architecture and Domain-Driven Design guidelines for Python services

**Goals:**
- Concrete folder/module structure conventions the team should follow
- Boundaries between layers (domain, application, infrastructure)
- How to handle repositories, use cases, and aggregates in Python
- General guidelines reusable across services (not just fm-flow)

### Session Setup

_Fresh session started 2026-06-17. Scope: comprehensive DDD + Clean Architecture for Python — covering structure, layer contracts, tactical patterns, and team-level conventions._

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Clean Architecture + DDD for Python, with emphasis on Python-native idioms over Java/C# orthodoxy

**Recommended Techniques:**

- **Assumption Reversal:** Clear the field — challenge which DDD/CA assumptions belong in Python and which are cargo-culted from other ecosystems
- **Morphological Analysis:** Systematically map every dimension (layers, naming, file org, DI, aggregates, test layout, cross-service contracts)
- **Cross-Pollination:** Steal the best from Django, FastAPI, Go, Rust, and JVM event-sourcing ecosystems

**AI Rationale:** DDD/CA's biggest risk in Python is uncritical porting of Java patterns. The sequence first clears bad assumptions, then generates comprehensive coverage, then grounds it in real-world precedent.

## Technique Execution

### Phase 1 — Assumption Reversal

Challenged which DDD/CA assumptions transfer from Java/C# to Python and which are ceremony without payoff.

**Key reversals surfaced:**
- ABCs are not needed — `typing.Protocol` gives structural subtyping with no inheritance coupling
- A DI container is needed, but `@inject` must be confined to the adapter layer only
- Session lifecycle must not leak into the application layer — UoW owns it
- The "publish events after commit" ordering is not optional — it must be enforced structurally

---

**[Structure #1]: Protocol-First Contracts**
_Concept:_ Layer boundaries defined via `typing.Protocol`. Any class satisfying the protocol shape is valid — no explicit `implements` declaration. `python-dependency-injector` wires concrete implementations at the composition root.
_Novelty:_ Unlike ABCs, Protocols keep the domain layer completely clean of framework imports. The domain defines what it needs as a shape; infrastructure satisfies it without knowing the domain exists.

**[Structure #2]: Composition Root in `containers.py`**
_Concept:_ A single `DeclarativeContainer` owns all wiring. `WiringConfiguration(modules=[".endpoints"])` explicitly limits `@inject` to the adapter layer — domain and services are completely clean of DI framework imports.
_Novelty:_ The container is the only file that knows about both infrastructure and application services. Everything else is plain Python.

**[Structure #3]: Session Factory over Session**
_Concept:_ Repositories receive a `session_factory` callable, not a `Session` directly. The container passes `db.provided.session` — a provider-scoped callable — so the repository controls session lifecycle per operation.
_Novelty:_ Avoids injecting a long-lived session into a request-scoped object. Request isolation is enforced by construction.

**[Structure #4]: `@inject` as Layer Boundary Marker**
_Concept:_ `@inject` only appears in `endpoints.py`. It functions as an architectural lint rule: if `@inject` appears in `services.py` or `domain/`, something has gone wrong.
_Novelty:_ The decorator becomes a convention signal, not just a wiring mechanism. Enforceable with a grep in CI.

**[Structure #5]: Container Composition by Bounded Context**
_Concept:_ Sub-containers own their full stack (repo + service). The root container owns shared infrastructure and composes sub-containers, passing shared dependencies via `providers.Dependency()`.
_Novelty:_ Bounded contexts are self-contained DI units. Adding a new context = new sub-container, zero changes to existing ones.

---

### Phase 2 — Morphological Analysis

Mapped all dimensions of the guidelines systematically: transaction management, cross-cutting concerns, event delivery, and folder structure.

**[Structure #6]: Unit of Work as Cross-Cutting Transaction Boundary**
_Concept:_ UoW owns the SQLAlchemy session and exposes repositories as attributes. Container provides it as a `Factory` (new instance per call). The service calls it as a context manager — commit/rollback is automatic.
_Novelty:_ Repositories are not injected directly into services — the UoW is. A use case touching multiple aggregates gets one transaction with zero extra wiring.

**[Structure #7]: Aggregate-Collected Events, UoW-Dispatched**
_Concept:_ Aggregates maintain an internal `_events` list. `pop_events()` drains it. The UoW collects events from all tracked aggregates via `CollectingRepository`, commits the DB write, then dispatches — in that order, always.
_Novelty:_ The safe ordering (commit → publish) is enforced by construction. No developer can accidentally publish before commit.

**[Structure #8]: Transactional Outbox as Reliability Layer**
_Concept:_ Domain events are written to an `outbox` table inside the aggregate's DB transaction. A relay process polls and publishes independently. Aggregate write and event write are atomic; relay-to-bus is at-least-once.
_Novelty:_ The UoW never talks to the event bus directly. The bus becomes an infrastructure detail the domain never touches.

**[Structure #9]: Per-Message Commit in Relay**
_Concept:_ The relay commits `published=True` after each successful publish, not in a batch. If the relay crashes mid-batch, only unpublished messages retry.
_Novelty:_ Keeps at-least-once delivery tight without needing distributed transactions between DB and bus.

**[Structure #10]: Flat vs. Nested Layout by Aggregate Count**
_Concept:_ Services with one aggregate use a flat four-layer layout. Services with two or more aggregates add a context subdirectory inside each layer. The decision point is the number of aggregates, not endpoints.
_Novelty:_ Avoids premature nesting — a single-aggregate service with nested directories is ceremony with no payoff.

---

### Phase 3 — Cross-Pollination

Grounded decisions in real-world precedent from other ecosystems and addressed cross-context, config, and error handling.

**[Structure #11]: ACL Protocol in Consuming Domain**
_Concept:_ The consuming context defines a Protocol for what it needs from another context — in its own vocabulary. The implementation in `infrastructure/` translates. The domain never sees the other context's model.
_Novelty:_ Model independence is preserved even for synchronous reads. If the source context's model changes, only the ACL adapter changes.

**[Structure #12]: Same-DB ACL vs. HTTP ACL**
_Concept:_ Within a service, ACL adapters query the DB directly. After a service split, the same Protocol is implemented by an HTTP client. The consuming domain doesn't know or care which.
_Novelty:_ Splitting a monolith into microservices later only requires swapping the ACL implementation — the domain Protocol stays identical.

**[Structure #13]: Exception Hierarchy Rooted in Domain**
_Concept:_ Each context defines a base `DomainError` subclass. Specific exceptions inherit from it. `api/exception_handlers.py` maps specific exceptions to HTTP responses. The base acts as a safety net catch-all.
_Novelty:_ Domain exceptions carry no HTTP knowledge. A single base handler catches any unhandled domain exception and returns 500, making gaps visible in logs.

**[Structure #14]: 503 for Infrastructure, 500 for Bugs**
_Concept:_ Infrastructure layers wrap their exceptions into `InfrastructureUnavailable` (from `packages/common/`). The API layer maps this to 503. All other unhandled exceptions fall through to a catch-all 500.
_Novelty:_ 503 (retryable) and 500 (bug) are structurally distinct — on-call alerting can differentiate infra issues from code bugs automatically.

---

## Decisions Made — ADR Index

| ADR | Decision |
|---|---|
| [0018](../adr/0018-python-service-layer-architecture.md) | Four-layer Clean Architecture; flat vs. nested by aggregate count; test layout mirrors source tree |
| [0019](../adr/0019-dependency-injection-python.md) | `typing.Protocol` for abstractions; `python-dependency-injector` with sub-containers per context; `@inject` in `api/` only |
| [0020](../adr/0020-unit-of-work-pattern.md) | UoW per context; `CollectingRepository` tracks aggregates; events collected before commit, dispatched after |
| [0021](../adr/0021-transactional-outbox-event-delivery.md) | Outbox table in same transaction; relay process with per-message commit; at-least-once with `event_id` deduplication |
| [0022](../adr/0022-cross-context-anti-corruption-layer.md) | Sync ACL always; consuming context defines Protocol in its own vocabulary; adapter in `infrastructure/`; async events not used |
| [0023](../adr/0023-configuration-management.md) | `pydantic-settings` owns loading and validation; container consumes as `providers.Singleton(Settings)`; domain receives primitives only |
| [0024](../adr/0024-error-handling.md) | Domain exceptions carry no HTTP concepts; all mapping in `api/exception_handlers.py`; 503 for infra failures, 500 for bugs; `InfrastructureUnavailable` in `packages/common/` |

## Open Topics

- Testing conventions (unit / integration / e2e split, fakes vs. mocks)
- CQRS / read models — do queries follow the same layer structure?
