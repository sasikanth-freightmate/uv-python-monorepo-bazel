# ADR-0017: Testing & quality strategy

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0015 (entrypoints), ADR-0016 (Python stack); governs the PR ladder (`../implementation/pr-ladder.md`)

## Context

The build must stay correct and shippable at every step. We want confidence from **real behavior**, not from fakes that paper over unbuilt pieces.

## Decision

### Every PR ships tests and stays green

- **Unit tests** for pure logic (DAG walk, CEL evaluation, validation, read-model projection, sticky bucketing, version selection) — exercised directly, no mocks (the logic is pure).
- **Integration tests** against **real dependencies via [Testcontainers]**: Postgres, Redis, Temporal (the official test server), and S3/KMS (LocalStack). Auth is exercised end to end through the app's own register/login (app-issued session tokens — no external issuer to fake).
- **CI runs unit + integration on every push**; `main` is always deployable; **each PR leaves the whole system in a running, tested state**.
- Coverage is judged by **shipped-path exercise**, not a vanity percentage — every code path a PR introduces is tested.

### No mocks/stubs in production code

- Production code **never** ships placeholder/fake implementations to be replaced later. Dependencies are **built in dependency order** so nothing needs faking "in between" (this constrains the ladder ordering — e.g. connections/secrets are built *before* any executor that resolves a secret; the interpreter skeleton is proven with a **real** node type, not a no-op).
- In-process mocking of our own seams is disallowed. If a unit needs a dependency, it's an integration test against the real thing.

### Third-party SaaS boundaries

External providers (Slack, SendGrid, carrier APIs, OAuth token endpoints, enrichment) are exercised in integration tests against a **containerized fake at the network boundary** (e.g. WireMock/MockServer) or a provider **sandbox** — a **real network call** to a controllable server. This is a boundary test double, **not** an in-code mock, and it is the only permitted substitution. Contract tests pin the request/response shape.

### Levels

- **Unit** — pure domain logic.
- **Integration** — a role/feature against real infra (Testcontainers).
- **End-to-end** — `flow-ui` (Playwright) against the real backend for the user-facing happy paths (authoring, live trace).

## Consequences

**Positive**

- Confidence comes from real Postgres/Redis/Temporal/S3 behavior, including RLS, partitioning, replay, and pub/sub — the things mocks get wrong.
- "Green at every commit, no stubs" forces correct dependency ordering and prevents integration debt.
- Boundary fakes keep third-party tests deterministic without faking our own code.

**Negative / constraints**

- Integration suites are **slower** and need Docker in CI; mitigate with parallelism, container reuse, and a fast unit tier.
- Strict ordering **constrains the ladder** (some pieces move earlier so their real deps exist) — already reflected in the ladder.
- Boundary fakes must be kept faithful to real provider contracts (contract tests, periodic sandbox runs).

## Alternatives considered

- **Unit-heavy + mocks for infra** — rejected: mocks hide RLS/replay/partition/pub-sub bugs, exactly our risk areas.
- **Stub seams between PRs, fill later** — rejected by the explicit no-stubs rule; creates hidden integration debt.
- **E2E-only** — rejected: too slow/coarse to localize failures; we keep a unit + integration + thin-e2e pyramid.

[Testcontainers]: https://testcontainers.com
