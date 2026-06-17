# ADR-0008: Credentials & secrets

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** sasikanth
- **Related:** ADR-0001 (interpreter determinism), ADR-0004 (read-model redaction), ADR-0006 (eval-workflow enrichment), ADR-0007 (late-bound vs versioned)

## Context

External-call steps, the trigger eval-workflow's enrichment fetches, and the Connections screen (Slack, SendGrid, Carrier API, QuickBooks, Postgres, …) all need credentials. Secrets must never leak into anything durable that is replayed, shared, or shown to users.

## Decision

### Security invariant

- A node config references a **connection by id** (`use connection: slack-ops`), never a raw secret.
- Secrets are resolved **just-in-time, inside the activity** that makes the external call — **never** in deterministic workflow code (would be recorded in Temporal history = permanent leak), **never** persisted in the read-model.
- **Read-model redaction:** resolved secrets are scrubbed from `node_runs` input/output on the write path (the trace shows `Authorization: ***`).
- **Late-bound, not versioned:** a version snapshot stores the connection *reference*, not the secret. Restoring an old version uses today's connection; rotating a token requires no republish.

### Storage: KMS-envelope encryption in Postgres

- Connection secrets are stored as **ciphertext in Postgres**, encrypted with a per-record/data key that is itself wrapped by a cloud **KMS** (envelope encryption).
- The app owns the schema, access paths, and rotation. One datastore; no separate secrets service to run in v1.
- Decryption happens only in the activity layer, just before use.

### OAuth token lifecycle: refresh-on-use

- When an activity resolves an OAuth token that is expired or within a small **proactive margin (~5 min)** of expiry, it refreshes via the OAuth refresh endpoint, updates the stored ciphertext, and proceeds.
- **Single-flight:** concurrent refreshes for the same connection are de-duplicated so activities don't refresh-race.
- On refresh failure (revoked/invalid), the connection is marked **`error`** (the Connections screen's red state); workflows using it **fail-fast** at the step with a clear "reauthorize *X*" error, and pre-publish validation can warn.

### Scoping

Connections belong to a workspace/org; workflows may only reference connections within their workspace. (RBAC details deferred to the auth/multitenancy work.)

## Consequences

**Positive**

- Secrets never touch workflow definitions, Temporal history, or the read-model — no replay/share/trace leak surface.
- Token rotation and reauthorization are decoupled from workflow versions (late binding).
- Minimal infra for v1 (KMS + Postgres); decryption confined to the activity layer.

**Negative / constraints**

- We are in the secrets-custody business (KMS key management, rotation, access auditing are on us).
- Refresh-on-use makes the first call after expiry pay refresh latency; needs robust single-flight to avoid races.
- Read-model write path must reliably redact — a redaction miss is a leak; needs tests and a deny-by-default field policy.
- A revoked connection surfaces only when a run hits the step (fail-fast); proactive health checks are a later enhancement.

## Alternatives considered

- **Dedicated secrets manager** (Vault / AWS / GCP) — stronger isolation/audit/rotation primitives; deferred to keep v1 infra small. Revisit if compliance or blast-radius becomes first-order.
- **Background token refresher** / **hybrid** — proactively refresh before expiry; deferred in favor of refresh-on-use; upgrade to hybrid if hot-path refresh latency bites.
- **Inlining secrets in node config** — rejected outright: violates the invariant (leaks via definition/history/trace, couples secrets to versions).
