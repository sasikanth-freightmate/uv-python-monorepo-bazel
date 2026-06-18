# Codebase conventions

## ADRs are authoritative

Before making any architectural decision — test structure, layer imports, DI wiring, error handling, naming — read the relevant ADR in `docs/adr/`. ADRs override any default behaviour or prior training.

Key ADRs:

| ADR | Topic |
|-----|-------|
| [ADR-0015](docs/adr/0015-role-based-entrypoints.md) | Role-based entrypoints (`--role` flag) |
| [ADR-0017](docs/adr/0017-testing-quality-strategy.md) | Testing strategy — unit vs integration, no in-process mocking |
| [ADR-0018](docs/adr/0018-python-service-layer-architecture.md) | Python service layer (Clean Architecture + DDD), **test layout** |
| [ADR-0019](docs/adr/0019-dependency-injection.md) | DI with dependency_injector |
| [ADR-0020](docs/adr/0020-unit-of-work.md) | Unit of Work pattern |
| [ADR-0021](docs/adr/0021-transactional-outbox.md) | Transactional outbox |

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

## Build system

- Bazel with `aspect_rules_js` (frontend) and `aspect_rules_py` (Python)
- Run tests: `bazel test //apps/flow_backend:all`
- Filter by tag: `bazel test //apps/flow_backend:all --test_tag_filters=unit`
- Dev server: `ibazel run //apps/flow-ui:dev` (do not run `next build/start` manually)
