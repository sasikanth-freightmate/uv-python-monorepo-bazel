# Codebase conventions

## ADRs are authoritative

Before making any architectural decision — test structure, layer imports, DI wiring, error handling, naming — read the relevant ADR in `docs/adr/`. ADRs override any default behaviour or prior training.

All ADRs are required reading before writing code in the area they cover:

| ADR | Title | What it governs |
|-----|-------|-----------------|
| [ADR-0001](docs/adr/0001-interpreter-on-temporal-execution-model.md) | Interpreter-on-Temporal | One generic Temporal workflow loads a pinned definition as data; nodes dispatched as activities |
| [ADR-0002](docs/adr/0002-run-state-stored-outside-temporal.md) | Run state outside Temporal | Temporal = orchestration truth only; Postgres/S3 = canonical run data; storage lane declared per node type |
| [ADR-0003](docs/adr/0003-condition-evaluation-via-activity.md) | Condition evaluation via activity | Conditions/expressions evaluated in a dedicated activity fetching referenced outputs |
| [ADR-0004](docs/adr/0004-run-read-model-and-realtime-reporting.md) | Run read-model & real-time reporting | Postgres read-model via idempotent `recordProgress` activity; Redis bus for real-time UI deltas |
| [ADR-0005](docs/adr/0005-run-failure-and-recovery.md) | Run failure & recovery | Fail-fast on definitive failure; binary status; retry-from-failed on same version seeded from read-model |
| [ADR-0006](docs/adr/0006-trigger-system-and-provisioning.md) | Trigger system & provisioning | Unified event ingestion/matching; desired-state reconciler; eval-workflow for I/O-capable filters |
| [ADR-0007](docs/adr/0007-versioning-routing-policy-and-canary.md) | Versioning, routing & canary | Routing policy replaces single version pointer; sticky-by-key assignment; monotonic canary ramping |
| [ADR-0008](docs/adr/0008-credentials-and-secrets.md) | Credentials & secrets | Connections referenced by id; secrets resolved just-in-time in activities; KMS-envelope encryption |
| [ADR-0009](docs/adr/0009-node-type-system.md) | Node-type system | Built-in node catalog; manifest (metadata, config schema, output schema, storage lane, retrySafe) + executor |
| [ADR-0010](docs/adr/0010-expression-and-reference-subsystem.md) | Expression & reference subsystem | CEL is canonical; `{{ <CEL> }}` interpolation; structured builder emits CEL; server-side validation |
| [ADR-0011](docs/adr/0011-auth-multitenancy-rbac.md) | Auth, multitenancy & RBAC | Cognito identity; memberships+roles in Postgres; pool tenancy with RLS; `org_id` in Temporal context |
| [ADR-0012](docs/adr/0012-persistence-and-event-sourced-read-model.md) | Persistence & event-sourced read-model | JSONB graph storage; `run_events` append-only log; time-range partitioning + tiered retention |
| [ADR-0013](docs/adr/0013-reliability-and-idempotency.md) | Reliability & idempotency | Effectively-once via deterministic `workflow_id` + dedup; system-derived idempotency keys |
| [ADR-0014](docs/adr/0014-dynamic-config-derived-node-outputs.md) | Dynamic config-derived node outputs | `output_spec` (static or `from_config`); broken refs are publish-blocking errors |
| [ADR-0015](docs/adr/0015-backend-service-topology.md) | Backend service topology | Modular monolith; five entrypoints (api/worker/ingestion/gateway/reconciler); `--role` flag |
| [ADR-0016](docs/adr/0016-technology-stack.md) | Technology stack | Python + FastAPI; `cel-python`; SSE gateway; `temporalio`/SQLAlchemy/redis-py; OpenAPI TS codegen |
| [ADR-0017](docs/adr/0017-testing-and-quality-strategy.md) | **Testing & quality strategy** | Every PR ships unit + Testcontainers integration tests; no mocks of own seams; boundary fakes only |
| [ADR-0018](docs/adr/0018-python-service-layer-architecture.md) | **Python service layer architecture** | Four layers (domain/application/infrastructure/api); strict inward deps; `tests/` layout |
| [ADR-0019](docs/adr/0019-dependency-injection-python.md) | **Dependency injection** | `typing.Protocol` abstractions; `DeclarativeContainer`; `@inject` in api layer only |
| [ADR-0020](docs/adr/0020-unit-of-work-pattern.md) | **Unit of Work** | UoW owns session + repositories; collects domain events; commits atomically; dispatches after commit |
| [ADR-0021](docs/adr/0021-transactional-outbox-event-delivery.md) | **Transactional outbox** | Domain events written to `outbox_messages` in same transaction; relay publishes with crash-safe dedup |
| [ADR-0022](docs/adr/0022-cross-context-anti-corruption-layer.md) | Cross-context ACL | Cross-context reads synchronous only; consuming context defines Protocol; ACL adapter in infrastructure |
| [ADR-0023](docs/adr/0023-configuration-management.md) | **Configuration management** | `pydantic-settings` owns config; startup validation; domain layer sees no config objects |
| [ADR-0024](docs/adr/0024-error-handling.md) | **Error handling** | Domain exceptions carry no HTTP concepts; all HTTP mapping in `api/exception_handlers.py` |

## Test layout (ADR-0018)

Tests for Python services live in a `tests/` directory next to the service root, **not** co-located with source files:

```
apps/<service>/
├── tests/
│   ├── unit/
│   │   ├── test_config.py
│   │   ├── domain/<context>/test_models.py
│   │   └── application/<context>/test_use_cases.py
│   └── integration/
│       ├── test_roles.py
│       └── test_migrations.py
├── domain/
├── application/
└── ...
```

- File prefix: `test_*.py` (ADR-0018 convention)
- Bazel tags: `unit` tests get `tags = ["unit"]`; integration tests get `tags = ["integration"]`; Docker-dependent tests also get `tags = ["requires-docker"]`
- Unit tests: pure Python, no DB, no containers, no mocks of own seams
- Application layer unit tests use an in-memory fake UoW (real implementation of the Protocol, not a mock)
- Integration tests that need a real DB use Testcontainers
