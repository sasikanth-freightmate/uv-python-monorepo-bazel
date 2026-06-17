# ADR-0018: Python Service Layer Architecture (Clean Architecture + DDD)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0019 (dependency injection), ADR-0020 (unit of work), ADR-0021 (transactional outbox)

## Context

Python services in this platform need consistent structural conventions. Clean Architecture and Domain-Driven Design provide the conceptual model, but both were designed for Java/C# ecosystems. Naively porting their conventions produces verbose, un-Pythonic code (ABCs everywhere, anemic domain models, excessive indirection). The goal is a Python-native interpretation that preserves the important invariants — layer isolation, testability, domain purity — without the ceremony.

## Decision

Structure each Python service as four layers with strict dependency direction (inward only).

### Layout: multi-context service (2+ aggregates)

```
service/
├── main.py                            # create_app() factory
├── containers.py                      # root DI container
├── containers/
│   └── <context>.py                   # one sub-container per bounded context
│
├── domain/
│   ├── shared/
│   │   └── value_objects.py           # value objects shared across contexts
│   └── <context>/
│       ├── models.py                  # aggregates + entities; pure Python, no framework imports
│       ├── repositories.py            # Protocol definitions only — no implementations
│       └── events.py                  # domain events raised by aggregates
│
├── application/
│   └── <context>/
│       ├── use_cases.py               # orchestrates domain + infrastructure via UoW
│       └── unit_of_work.py            # owns session + collecting repositories for this context
│
├── infrastructure/
│   ├── database.py                    # SQLAlchemy engine + session factory
│   ├── outbox/                        # shared across all contexts — not per-context
│   │   ├── models.py                  # OutboxMessage SQLAlchemy model
│   │   ├── repository.py
│   │   └── relay.py                   # background relay process
│   └── <context>/
│       └── repositories.py            # concrete SQLAlchemy implementations of domain Protocols
│
└── api/
    ├── middleware.py                   # request ID, tracing, auth token extraction
    ├── exception_handlers.py           # domain exception → HTTP status mapping
    └── <context>/
        ├── endpoints.py               # FastAPI routers; only layer that imports @inject
        ├── schemas.py                 # Pydantic request/response types (not domain models)
        └── dependencies.py            # reusable FastAPI Depends() helpers
```

### Layout: single-context service (1 aggregate, most microservices)

Flatten — no subdirectory per context:

```
service/
├── main.py
├── containers.py
├── domain/
│   ├── models.py
│   ├── repositories.py
│   └── events.py
├── application/
│   ├── use_cases.py
│   └── unit_of_work.py
├── infrastructure/
│   ├── database.py
│   ├── repositories.py
│   └── outbox.py
└── api/
    ├── endpoints.py
    └── schemas.py
```

The decision to add context subdirectories is triggered by the number of aggregates, not the number of endpoints or routes.

### Test layout

Tests mirror the source tree, split by test type:

```
tests/
├── unit/
│   ├── domain/<context>/test_models.py       # pure Python, no DB, no container
│   └── application/<context>/test_use_cases.py  # UoW replaced with in-memory fake
├── integration/
│   └── infrastructure/<context>/test_repositories.py  # real DB, real session
└── e2e/
    └── test_<context>_api.py                 # full stack via TestClient
```

### Naming conventions

| Concern | Location | Rule |
|---|---|---|
| Cross-context value objects | `domain/shared/value_objects.py` | If a type appears in two `models.py`, move it to `shared/` |
| Outbox infrastructure | `infrastructure/outbox/` | Shared mechanism — never nested under a context |
| Pydantic API schemas | `api/<context>/schemas.py` | Never imported from `domain/`; never inherit `BaseModel` in domain models |
| Domain services | `domain/<context>/services.py` | Stateless logic that spans multiple aggregates within one context |
| Application use cases | `application/<context>/use_cases.py` | One class per command; cross-context calls go through application layer, not domain |

**Layer import contracts:**

- `domain/` — imports only stdlib and `domain/shared/`
- `application/` — imports `domain/` only
- `infrastructure/` — imports `domain/` and SQLAlchemy
- `api/` — imports `application/`, `infrastructure/`, and FastAPI
- `@inject` decorator is forbidden outside `api/`

## Consequences

**Positive**

- Domain layer is independently testable with no DB or framework setup.
- Infrastructure implementations are swappable without touching domain or application logic.
- `@inject` appearing in `services.py` or `models.py` is a visible, greppable violation.

**Negative / constraints**

- More directories than a flat package; justifiable only for services with multiple aggregates or significant business logic. Simple CRUD services should prefer a flat layout.
- Developers unfamiliar with the pattern need onboarding — the value is not obvious until the first time a repository implementation is swapped for testing.

## Alternatives considered

- **Flat package (Django-style)** — rejected for services with non-trivial domain logic; accepted for simple CRUD services where the overhead isn't warranted.
- **Hexagonal / Ports & Adapters naming** — equivalent structurally; rejected in favour of Clean Architecture naming because it's more widely known on the team.
