# ADR-0016: Technology stack & realtime transport

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (Temporal), ADR-0004 (Redis/realtime), ADR-0010 (CEL), ADR-0011 (auth/multitenancy), ADR-0015 (monolith/entrypoints)

## Context

`apps/flow-backend` (the modular monolith, ADR-0015) needs a language, an API framework, and a realtime transport for the `gateway`. Constraints: Temporal (ADR-0001), CEL as the expression substrate (ADR-0010), AWS dependencies (KMS/S3), a TypeScript/Next.js frontend, and LLM-powered node executors (e.g. the document extractor, ADR-0014).

## Decision

### Language: Python

`apps/flow-backend` is **Python**. Rationale:

- **CEL is first-class** — `cel-python` is a real, maintained implementation, so ADR-0010 doesn't depend on the immature `cel-js` (the risk that worried us on a TS backend).
- **LLM/AI activities are native** — the document extractor and future AI nodes live naturally in Python's ecosystem.
- **Async fits** — Temporal's Python SDK, async DB, and SSE streaming all sit on `asyncio`.

### API framework: FastAPI

**FastAPI** (async, Pydantic validation, auto-generated **OpenAPI**). The OpenAPI spec is used to **generate a typed TS client for `flow-ui`**, recovering the contract type-sharing we lose by not being TS end-to-end.

### Realtime transport: SSE, self-hosted

- **SSE, not WebSocket, for v1** — run updates are one-directional (server→client); browser `EventSource` has built-in auto-reconnect that pairs with the snapshot-on-connect + deltas model (ADR-0004). WS is reserved for if client→server realtime (collab/presence) ever lands.
- **Self-hosted `gateway`** (ADR-0015) — Starlette streaming response + `redis-py` async pub/sub on `run:{id}`. No managed realtime dependency. Stateless per instance (any gateway serves any client via Redis).

### Supporting libraries

- **Temporal:** `temporalio` (official Python SDK) for workflows + activities.
- **CEL:** `cel-python` in the `evaluate` activity and the server-side `validate` endpoint (ADR-0010).
- **DB:** SQLAlchemy (async) + `asyncpg`; Alembic migrations; RLS via `SET LOCAL` session var.
- **Redis:** `redis-py` (async) for the bus and pub/sub.
- **Auth:** local email/password; scrypt hashing (stdlib) + app-issued HS256 session JWT via `PyJWT` (ADR-0011).

## Consequences

**Positive**

- CEL is first-class (`cel-python`); no `cel-js` gamble.
- LLM/external-IO activities are idiomatic in Python.
- FastAPI's OpenAPI codegen restores typed FE↔BE contracts despite the language split.
- `asyncio` aligns with Temporal, async DB, and SSE streaming.

**Negative / constraints**

- **No direct frontend type-sharing** — mitigated by OpenAPI-generated TS client, but it's codegen, not shared source.
- **Throughput < Go/Node** for raw CPU/connection-bound work — acceptable because the hot paths are IO-bound (Temporal, DB, external calls); revisit `ingestion`/`gateway` if connection/event volume bites (scaling domain).
- **Polyglot monorepo** — Python build tooling (e.g. `rules_python`) alongside the existing `aspect_rules_js`.
- Python typing discipline (mypy/Pyright) must be enforced to keep the domain core safe.

## Alternatives considered

- **TypeScript + Fastify** — would share types directly with the frontend, but `cel-js` immaturity made CEL (ADR-0010) a real risk; rejected in favor of Python's first-class CEL + LLM fit.
- **Go** — best Temporal SDK and `cel-go` reference CEL, but no frontend type-sharing and polyglot anyway; Python preferred for LLM ergonomics and FastAPI's codegen.
- **WebSocket / managed realtime (Ably, API Gateway WS)** — deferred; SSE self-hosted matches the one-way, Redis-backed design.
