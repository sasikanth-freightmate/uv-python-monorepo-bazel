---
stepsCompleted: [1, 2]
inputDocuments: ['Workflow Builder — Design Specification']
session_topic: 'HLD + LLD for the entire Workflow Builder product'
session_goals: 'Diverge across all architectural subsystems before converging on a solution; surface options, tensions, and open decisions'
selected_approach: 'progressive-flow'
techniques_used: ['Question Storming + Cross-Pollination', 'Morphological Analysis', 'Pre-mortem + Constraint Mapping', 'Decision Tree / Solution Matrix']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** sasikanth
**Date:** 2026-06-16

## Session Overview

**Topic:** High-level and low-level design for the entire Workflow Builder — a visual, canvas-based product for building dynamic branching workflows (Temporal-backed execution).

**Goals:** Stay in divergent/generative mode. Map all architectural subsystems, generate design options and surface tensions/open questions per subsystem, BEFORE converging on any single solution.

### Session Setup

Brownfield context: Next.js UI (`apps/flow-ui`) + Temporal for execution. Design spec covers 10 screens + supporting screens. We are designing the system architecture beneath that UX.

### Territory Map — architectural subsystems (divergent enumeration)

1. Workflow definition model & schema
2. Execution engine (definition → running Temporal workflow)
3. Versioning & drafts
4. Trigger system (scheduled + event-based)
5. Expression / reference / data-passing system
6. Node-type system & extensibility (plugins)
7. Run state, observability & live updates
8. Frontend / canvas architecture
9. Persistence & data layer
10. Backend service topology & API design
11. Auth, workspaces, multitenancy, RBAC
12. Credentials & secrets
13. Reliability: retries, idempotency, exactly-once
14. Scaling & tenant isolation (workers, task queues)

## Phase 1 — Expansive Exploration (Question Storming + Cross-Pollination)

### Ideas / Decisions captured

**[Execution #1]: Interpreter-on-Temporal** — One generic Temporal workflow type loads a pinned definition as data and walks the graph, dispatching nodes at runtime. No per-workflow code deploy. _Novelty:_ non-engineers self-serve; "draft can run" is trivial; trades for a determinism problem.

**[Execution #2]: ~~Conditions are pure~~ → SUPERSEDED by #4** — Original idea (pure in-workflow eval) dropped because it forces a dual-state/promotion layer that conflicts with #3.

**[Execution #4]: Conditions eval-in-activity (no dual state)** — Branch/expression evaluation runs in an `evaluate` activity that fetches the referenced step output from Postgres/S3 on demand. Replay-safe for two reasons: (1) step outputs are immutable, (2) Temporal records activity results in history and replays the recorded value instead of re-running. _Novelty:_ eliminates the promotion/dual-state layer — workflow holds only pointers; single source of truth; conditions can reference the *full* output, not just promoted scalars. _Cost:_ a history event + round-trip per condition (watch high-iteration Loops).

**[Data #5]: Step declares its own output storage (STATIC)** — Each step type statically declares its lane (Postgres vs S3); node-type author owns the call since they know the payload shape. No global rule, no runtime size-threshold spill — chose predictability/debuggability over optimal placement. Generic HTTP-style steps pessimistically pick S3.

> ✅ Execution + data core LOCKED → captured as ADR-0001/0002/0003 in `docs/adr/`.

### Control-flow mapping (in progress)

**[Control #6]: Sub-graphs as child workflows** — Parallel branches, Map items, Loop bodies run as child workflows (not inline). _Why:_ isolates Temporal history (solves Loop/Map history-growth from ADR-0003), gives independent retry, and the parent→child execution tree IS the per-item/per-branch sub-run model that screen 8 needs.

**[Control #7]: Two-layer run tracking** — (1) Temporal's native parent→child tree for execution lineage + failure propagation; (2) a unified Postgres run record keyed by one `run_id` threaded into every child, with a hierarchical `node_path` (e.g. `map[item=42].sendEmail`). Granular per-node events live in each child's own history (keeps it small); humans see one coherent run via the read-model.

### Feasibility check: can Temporal APIs alone serve the UI? → NO

Walked every execution-tracking UI requirement (screens 1, 7, 8) against Temporal APIs. Native: status, start/close, lineage tree, search-attribute filters. **Five gaps:** (1) no "Waiting" status, (2) history retention deletes old runs, (3) no push/subscribe API, (4) no per-node/branch/I/O model, (5) no clean aggregates.

**[Reporting #8]: Postgres run read-model + Redis bus** — Interpreter populates a Postgres read-model (`runs`, `node_runs`) via an idempotent, Temporal-retried `recordProgress` activity (durable, converges to reality). Run status incl. "Waiting" and branch-taken are columns; retention is ours; aggregates trivial. Live updates: the activity publishes best-effort deltas to a **Redis bus** (`run:{id}`) → realtime gateway → SSE/WS to browser. Client uses **snapshot-on-connect + deltas** so a missed publish self-heals. _Captured as ADR-0004._

> ✅ Reporting/observability story LOCKED → ADR-0004. Temporal = engine + lineage; Postgres read-model = everything the UI reports; Redis = live fan-out.

**[Control #9]: Fail-fast on child failure** — Any definitively-failed node fails the whole run; in-flight siblings are cancelled. Status model stays binary (no "completed with errors"). _Consequences:_ (a) "failed" means *after* the node's Temporal activity retry policy is exhausted; (b) cancelled siblings get a distinct `node_runs.status = cancelled` (vs failed) and render dimmed, not red, so the real failure stays the focal point.

**[Recovery #10]: Retry-from-failed, same version (Case A only)** — New interpreter run on the same pinned version, seeded from the prior run's read-model: skip succeeded nodes (reuse stored outputs), resume at the failed node forward, linked as `retry_of`. Clean because state is external (ADR-0002) — no Temporal Reset, no history-retention dependency. UI: "Retry from here" on the failed node. _Out of scope:_ Case B (edited workflow → new version → fresh run from trigger, not a graft); rerun-from-any-node (deferred); idempotency = documented node-type contract, enforcement deferred. _Captured with #9 in ADR-0005._

> ✅ Run failure & recovery LOCKED → ADR-0005.

**[Control #11]: Join = wait-for-all only, pure barrier (v1)** — Parallel branches reconverge only via wait-for-all; fail-fast stays a true global invariant (no scoped exceptions). Join produces NO data — branch outputs are path-addressable directly (`parallel[branch=B].httpCall.output`) via the read-model. Wait-for-any (race/cancel-losers) and keyed-merge sugar both deferred.

**[Control #12]: Wait via subscription-table correlation** — On entering a Wait, interpreter writes `(run_id, execution_id, event_type, correlation_key, match_filter)` to Postgres `wait_subscriptions` (via activity); event-ingestion matches incoming events and signals the exact executions; row cleared on match/timeout. Exact (not Visibility); same table doubles as the event-trigger index.

**[Control #13]: Wait unbounded by default; bounding encouraged not enforced** — Waits may run unbounded; platform forces no ceiling. Authors nudged via an amber **validation warning** (screen 9, non-blocking) on any timeout-less Wait. Accept long-lived `wait_subscriptions` rows; need an admin path to find/cancel stuck runs. Consistent with the "author owns the call" philosophy (cf. static storage lane).

**[Control #14]: Loop removed from scope → workflow is a DAG** — No Loop node. Nothing introduces back-edges, so every workflow is acyclic. Bounded iteration served by Map only; arbitrary while-loops not a v1 capability. _Collapses:_ ContinueAsNew, max-N, runaway detection, cycle handling in traversal/validation/layout — interpreter only walks forward. "Graph is a DAG" is a load-bearing invariant for downstream code.

> ✅ ENGINE FULLY SPECIFIED — execution, data, reporting, control-flow (Branch/Parallel/Join/Map/Wait), failure/recovery. Node vocabulary minus Loop. ADRs 0001–0005.

### Open forks (parking lot)
- (engine complete — none)

## Phase 1 — Trigger system

**Core insight (drives everything here):** workflows are *data*, not code (ADR-0001) — there is no "register at worker startup." The interpreter type is the only registered workflow; user workflows exist only at **publish time**. So triggers (schedules + subscriptions) must be **dynamically provisioned at publish and torn down at unpublish/archive** — a control-plane concern, not a worker concern.

**[Trigger #15 — DIRECTION]: Unified ingestion + matching, two subscription tables** — One ingestion/dedup/matching pipeline; matches each event against BOTH `trigger_subscriptions` (→ StartWorkflow, content-predicate, by source+type+filter) and `wait_subscriptions` (→ SignalWorkflow, run-keyed, by type+correlation_key). Not mutually exclusive — one event can start new runs AND resume waits. Differentiator is structural (trigger node vs Wait node) + correlation key (run-keyed vs unkeyed). Shared plumbing, differentiated semantics/actions/access-patterns.

> 🔖 BACKLOG (wait-vs-trigger details, revisit later): exclusive-consume option (lean: no for v1); dedup scope (lean: per-`event_id` global, then fan-out); confirm both-fire-independently; UI/doc surfacing of accidental same-event fan-out.

**[Trigger #16]: Provisioning = desired-state + reconciler (option c)** — Publish = one transactional Postgres write of desired state (incl. `trigger_subscriptions` rows, strongly consistent — event path needs no reconciler). Then: best-effort **immediate reconcile** of that workflow's Temporal Schedule for instant feedback, + a **continuous reconciler** converging desired→actual, healing drift and rebuilding all Schedules on boot. Schedule id deterministic `wf-{workflow_id}` → idempotent upsert/delete. _Key payoff:_ runtime state is always derived from Postgres, so "workflows aren't known at worker startup" becomes a non-issue by design. Only the scheduled path needs reconciliation (Temporal Schedule = the only external resource that can drift).

**[Trigger #17]: Overlap policy = per-workflow setting** — Scheduled overlap (Skip/BufferOne/AllowAll/CancelOther) is configured per-workflow in the trigger config (screen 5), default **Skip**. Maps directly to Temporal Schedule overlap policy; the reconciler writes it into the Schedule spec.

**[Trigger #18]: Trigger filters are I/O-capable → durable eval workflow** — Trigger filters can call external systems to fetch/enrich data (NOT pure predicates). So filter eval runs in a short-lived **Temporal eval workflow**, not at the edge: ingest → dedup → cheap in-process structural match (source,event_type) → eval workflow does enrichment activities (creds/retries/timeouts) + predicate via **eval-in-activity (ADR-0003)** → on match `StartWorkflow(target, current_version)`, on no-match completes with no target run. _Payoff:_ unifies ALL expression evaluation into one path (eval-in-activity); the "portable expression engine" constraint disappears. _Volume bounded by_ the edge pre-filter (only candidates spawn eval workflows) + short-lived eval workflows + no-match creates no run.

> 🔖 BACKLOG: split filter expression into pure vs I/O parts — evaluate pure sub-predicates at the edge, only spawn eval workflow when they pass (perf optimization; not v1).

> ✅ TRIGGER SYSTEM fully specified (scheduled + event, provisioning, overlap, filter eval). Ready for ADR-0006.

## Frontend/canvas assessment (existing generated code)

**Architecture:** `apps/flow-ui` Next.js shell; `FlowApp.jsx` = single stateful class component owning all state, builds plain-data view-models. `packages/ui-components` = presentational (shadcn+Tailwind), VM-driven. Bespoke SVG canvas (not React Flow); geometry in `tokens.js`. **All mock data** (`data.js`), runs faked with setTimeout — NO backend. VM functions are the API seam.

**Already aligns with our ADRs:** references restricted to ancestors (`ancestorsOf`); declared output schema per type (`OUTPUT_FIELDS` = autocomplete/promotion source); run read-model shape (per-step input/output/timing/error/logs + branch-taken); **Waiting status** + **Retry-from-failed** already drawn; versioning (draft/live/archived + restore-as-draft + diff); token syntax `{{ slug.field.path }}`.

**Gaps/mismatches needing decisions:**
1. 🔴 **Node-vocab divergence** — UI has freight-concrete linear+binary model (trigger/schedule/http_in/condition/filter/delay/enrich/assign/record/notify/email); NO Parallel/Join/Map/event-Wait — but our whole engine was designed around those. Linear-DAG-UI vs concurrent-DAG-engine must reconcile.
2. **Condition is binary** (true/false) vs spec's N-way labeled branches + Otherwise.
3. **`delay` ≠ event-Wait** — no UI for Control #12/#13 wait/correlation.
4. 🔴 **Canary/traffic-split exists in UI** (canarySplit, promote/rollback) — but backend only fires `current_version`; weighted version selection is a NEW requirement.
5. ~~Flow orientation~~ — RESOLVED: left-to-right is intentional/correct (spec's top-to-bottom superseded).
6. Node-type schema hardcoded in frontend (NODE_DEFS/FIELD_DEFS/OUTPUT_FIELDS) — must become backend-driven (node-type registry) so engine + UI share one source of truth.

**[Scope #19]: v1 vocabulary = linear + binary condition; concurrency deferred** — Ship concrete steps + binary condition + filter + timed delay + triggers (schedule/event/webhook). DEFER Parallel/Join/Map/event-Wait. _Engine implication:_ no sub-graphs in v1 → interpreter needs NO child workflows (single workflow walking a binary-branch DAG); Join, sub-run drill-down, and wait_subscriptions correlation all deferred. v1 = interpreter + delay-timer + fail-fast + retry + read-model. Designed engine generality stays valid for later; nothing wasted, just sequenced.

## Phase 1 — Canary / traffic-splitting (real backend capability)
**Model shift:** ADR-0001's single `current_version` pointer generalizes to a **routing policy**: `{ live_version, canary_version?, canary_weight%, sticky_key_expr? }`. 100% → live when no canary; a canary adds a weighted second active version.

**[Canary #20]: Sticky-by-key version assignment** — `bucket = stableHash(eval(sticky_key_expr, event)) % 100; canary iff bucket < weight`. Same entity → same version always; deterministic; **monotonic ramp** (raising weight only moves more entities into canary, never flip-flops). Sticky key = author expression over the event (e.g. `event.shipment.customer_id`). Hash must be one fixed shared impl across run-start sites.

**[Canary #21]: No canary for scheduled (v1)** — Scheduled runs have no per-run entity to hash, so canary is an event-workflow capability only; scheduled publishes straight to live. Run-start selection: event path computes sticky bucket; scheduled path → thin dispatcher `startScheduledRun(workflow_id)` resolves `live_version` at fire-time (so promote/weight changes need NO Schedule reconciliation). Metrics free from read-model grouped by `version_id`. In-flight runs immune (pinned).

> ✅ CANARY / VERSIONING ROUTING locked → ADR-0007 (amends the single-current_version model).

## Phase 1 — Credentials & Secrets (load-bearing: eval-workflow, external steps, Connections screen)

**[Secrets #22]: Security invariant** — Node configs reference a **connection by id** (`use connection: slack-ops`), never a raw secret. Secrets resolve **just-in-time inside activities only** — never in workflow definition, Temporal history, or read-model. _Ripples:_ version snapshots store the connection *reference* (creds are **late-bound, not versioned** — rotation needs no republish); `node_runs` I/O is **redacted** (`Authorization: ***`) on the read-model write path.

**[Secrets #23]: Storage = KMS-envelope-in-Postgres** — Connections stored as ciphertext in Postgres, encrypted with a data key wrapped by cloud KMS. App owns schema/rotation; one datastore. (Dedicated secrets manager (Vault/cloud) considered, deferred — revisit if compliance/blast-radius becomes first-order.)

**[Secrets #24]: OAuth = refresh-on-use** — Activity refreshes a token if expired/within ~5 min of expiry, updates ciphertext, proceeds; single-flight to avoid refresh races. Refresh failure → connection marked `error` (Connections red state) → workflows fail-fast at the step with "reauthorize X"; validation can warn. Connections scoped to workspace/org (RBAC deferred to auth work).

> ✅ CREDENTIALS & SECRETS locked → ADR-0008.

## Consolidation (2026-06-16)
- **ADR index:** `docs/adr/README.md` — 0001–0008 with status + one-liners + v1 scope note.
- **HLD synthesis:** `docs/architecture/hld-overview.md` — component diagram, decisions-by-domain table, key flows, v1 scope, parking lot.
- **Cross-ADR consistency note surfaced:** ADRs describe the *general* architecture; **Scope #19** sequences v1 (linear+binary, single interpreter workflow, no child workflows, wait_subscriptions/sub-run drill-down deferred). Noted in both index and HLD so the general/v1 distinction is explicit.

## Phase 1 — Node-type system

**[NodeType #25]: Built-in catalog only (v1)** — Fixed set authored by us, executors compiled into workers; manifests served from registry; no plugin SDK/sandboxing. Extensibility = v2+.

**[NodeType #26]: Node type = manifest + executor (keyed by `type_id`)** — Manifest (display, config-field schema, declared output schema, storage lane per ADR-0002, `retrySafe`) served to UI+validation; executor = worker activity. Frontend fetches manifests → kills gap #6 (one source of truth).

**[NodeType #27]: Schema capped to latest only** — One current schema per type; no historical retention; old versions may not render/run after a breaking change. _Qualifies ADR-0007 immutability_ (definition immutable, manifest/executor NOT versioned → not fully self-contained). Mitigation: additive changes by convention, breaking changes rare/reviewed, editor degrades gracefully ("outdated step config").

**[NodeType #28]: Idempotency = `retrySafe` flag only** — Manifest boolean gates whether "Retry from here" (ADR-0005) is offered; actual dedup is the executor's job; no key-template machinery in v1.

> ✅ NODE-TYPE SYSTEM locked → ADR-0009.

## Phase 1 — Expression / reference subsystem

**[Expr #29]: CEL substrate + structured-builder UI** — CEL is the canonical expression representation + evaluator (functions, compound logic, references, static type-checking; pure/deterministic/sandboxed → fits eval-in-activity 0003 + portability 0006). Structured builder (AND/OR groups of field/operator/value) is the guardrailed default UI emitting CEL; raw-CEL "advanced" mode for power users. (Chosen after requirements grew: compound logic + functions made hand-rolling ≈ reinventing CEL.)

**[Expr #30]: Shared reference-resolution + type-check core** — References resolve against node-type declared-output manifests (0009) + trigger event; CEL static type-check = screen-6 valid/invalid. Sticky-key (0007) = single CEL reference. Token interpolation = string with `{{ <CEL> }}` holes, same evaluator. Functions = pure transforms only; external data via enrichment activities (reconciles 0006: logic=CEL, I/O=activities).

**[Expr #31]: CEL canonical storage; server-side validation** — CEL string is source of truth (stored/evaluated/type-checked); builder parses the subset it understands, raw CEL → advanced/read-only. Authoritative type-check server-side (`validate` endpoint, single CEL impl); frontend does lightweight live hints.

> ✅ EXPRESSION / REFERENCE SUBSYSTEM locked → ADR-0010.

## Phase 1 — Auth / Multitenancy / RBAC

**[Auth #32]: Cognito = identity only** — Cognito User Pool for authN; validate JWT via JWKS; stable user key = `sub`. No app-built login. Cognito carries identity, NOT org/role.

**[Tenancy #33]: Pool model, RLS-enforced** — Shared DB, row-level `org_id`; isolation structural via **Postgres RLS** (fails closed). One shared Temporal namespace; `org_id` in run context, enforced in every data-touching activity (sets RLS session var); run_id/node_runs/*_subscriptions/routing org-scoped; S3 keys org-prefixed. _Hazard:_ org_id MUST cross the Temporal boundary.

**[RBAC #34]: Memberships + roles in Postgres** — `memberships(user_id=sub, org_id, role)`; multi-org supported; active org per request validated against memberships; resolved org_id drives RLS + Temporal. Roles admin/editor/viewer; connections/secrets **admin-only**; publish + canary promote/rollback **editor+**.

> ✅ AUTH / MULTITENANCY / RBAC locked → ADR-0011.

## Consolidation #2 — Persistence data model (2026-06-16)
- **`docs/architecture/data-model.md`** — full Postgres schema tying ADR-0001…0011 together: identity/tenancy, workflows/drafts/versions/routing, node-type registry (global), runs/node_runs read-model, triggers/subscriptions/dedup, connections/secrets.
- **Consistency check passed** across: org_id+RLS everywhere (denormalized to children); version pinning (immutable FK); version immutability (append-only); idempotent recordProgress upsert key; storage lanes; secret isolation+redaction; event dedup; capped node-type schema.
- v1 scope marked on schema: `wait_subscriptions` + hierarchical `node_path` present but v1-deferred (flat paths, single interpreter workflow).

## Phase 1 — Persistence schema (RE-BRAINSTORM of data-model.md's unilateral calls)

Fork-list (calls baked into data-model.md, now pressure-tested): graph blob vs normalized · node_runs state-rows vs event-log · read-model same-DB vs separate store · runs/node_runs partitioning+retention · full-snapshot vs dedup versions · org_id denormalization granularity · outputs table vs inline.

**[Persistence #35]: Graph storage = hybrid** — JSONB `content` canonical (atomic, immutable-per-version, what the interpreter loads) + derived index (GIN and/or thin `node_usages` table) for cross-graph queries (node-type usage, connection refs, impact analysis). Versions index once at publish; drafts rebuild on save. Versioning stays trivial (hash the doc).

**[Persistence #36]: Read-model is event-sourced** — Append-only `run_events` canonical (immutable row per transition, idempotent on `(run_id,node_path,seq)`); each append IS the Redis delta + projects into `node_runs` current-state + `runs` rollup. Full per-node timeline for the trace; append-only (no hot-row contention); mirrors Temporal's own model.

**[Persistence #37]: Time-range partitioning + tiered retention** — `run_events`/`runs`/`node_runs`/`node_outputs` partitioned by time (weekly/monthly); aging via `DROP PARTITION`. Tiers: events 30–90d, summaries months/years, payloads short + S3 lifecycle (UI degrades to "payload expired"). Canary metrics need only recent runs. Org sub-partitioning + cold archive deferred.

**[Persistence #38]: Read-model in same Postgres (v1), separable later** — One Postgres for v1; event-sourced model + Redis decoupling make `run_events`/projections liftable to a read replica or analytics store (ClickHouse-style) when reporting load demands — no rewrite. Separate CQRS store deferred.

> ✅ PERSISTENCE SCHEMA re-brainstormed → data-model.md updated (event log, hybrid index, partitioning/retention).

## Phase 1 — Reliability / idempotency

**[Reliability #39]: Effectively-once via 3-lever idempotency stack** — Temporal = at-least-once, so engineer effectively-once. L1 run creation: deterministic `workflow_id` = hash(workflow_id,event_id) (Temporal rejects dup) + `processed_events` atomic insert-on-unique event_id. L2 read-model: idempotent on (run_id,node_path,seq). L3 side effects (a+b): `retrySafe` flag + system-derived per-node idempotency key hash(run_id,node_path) passed to cooperating external APIs; at-least-once where API doesn't cooperate (documented). _Amends ADR-0009_ (idempotency-key pass-through, system-derived not author-configured).

**[Reliability #40]: Stuck-runs/poison = minimal app-side** — Run-level Temporal execution timeout (nothing runs forever → fail-fast on expiry); `dead_letter_events` table for events exhausting eval-workflow retries (+ basic alert); admin-cancel reuses existing run-cancel. Full ops console deferred; zombie-waits mostly post-v1 (v1 = bounded delay only).

> ✅ RELIABILITY / IDEMPOTENCY locked → ADR-0013.

## Phase 1 — Dynamic (config-derived) node outputs (REVISIT of ADR-0009 static outputs)

**[NodeOutput #41]: Output schema → `output_spec` (static | from_config)** — Outputs can be config-derived, not just type-static. Manifest `output_spec` = `static {path,type}[]` OR `from_config` (declarative rule projecting a repeatable config field → outputs; e.g. document extractor's `config.fields[]` of `{name,type,prompt}` → `extractor.<name>` typed by entry.type). Declarative so the **UI computes outputs locally** (no round-trip). Code-resolver `outputSchema(config)` deferred. _Amends ADR-0009._

**[NodeOutput #42]: Per-instance refs + broken-ref = publish-blocking** — Reference/autocomplete/type-env computes an upstream node's outputs from its config (per-instance). Renaming/removing a dynamic field that a downstream node references → live red in expression builder (screen 6) + **publish-blocking error** (screen 9 "refers to an output that no longer exists"). Dangling ref is incorrect (not author-risk) → blocks, unlike amber warnings. _Amends ADR-0010._

> ✅ DYNAMIC NODE OUTPUTS locked → ADR-0014 (amends 0009, 0010).

## Phase 1 — Backend service topology

**[Topology #43]: Modular monolith at `apps/flow-backend`, role entrypoints** — One codebase/build, shared domain core (interpreter, node executors, CEL evaluator, projection, types) → 5 independently-deployable entrypoints: `api` / `worker` / `ingestion` / `gateway` / `reconciler`. Each scales independently. Reconciler + periodic jobs (partition maintenance, retention, token health) = leader-elected/singleton. Gateway stateless-per-instance via Redis pub/sub (any instance serves any client via `run:{id}`). Microservices deferred until team/scale forces it (carve out by load later).

**[Topology #44]: Task-queue partitioning by workload class, config-driven** — Three queues: workflow / light-activity (recordProgress, evaluate, projection) / heavy-activity (LLM, HTTP, email, enrichment). Same `worker` entrypoint; process-arg config controls which queues it polls + which activities/workflows it registers (`worker --queues=heavy --activities=llm,http`) → independently-scaled `worker-light`/`worker-heavy` from one binary. Per-type/per-tenant queues deferred to scaling.

> ✅ BACKEND SERVICE TOPOLOGY locked → ADR-0015 (+ HLD deployment section).

## Tech stack & implementation planning

**[Stack #45]: Python + FastAPI** — Backend = Python/FastAPI. _Why:_ `cel-python` makes CEL (0010) first-class (vs cel-js gamble); LLM/AI activities (document-extractor prompts, 0014) idiomatic; asyncio fits Temporal/SSE. _Cost:_ no direct FE type-sharing → mitigated by FastAPI OpenAPI → generated TS client. Supporting: `temporalio`, `cel-python`, SQLAlchemy(async)+Alembic+asyncpg, `redis-py`. _Captured in ADR-0016._

**[Stack #46]: SSE, self-hosted gateway** — Realtime = SSE (not WS) for v1 — one-way push, `EventSource` auto-reconnect pairs with snapshot+deltas (0004). Self-hosted `gateway` (Starlette streaming + redis-py pub/sub on `run:{id}`), stateless per instance. WS/managed deferred. _Captured in ADR-0016._

> ✅ TECH STACK locked → ADR-0016. → **PR ladder authored: `docs/implementation/pr-ladder.md`** (23 PRs, v1, dependency-ordered; walking-skeleton at PR-14).

**[Testing #47]: Test-first, no-stubs policy** — Every PR ships unit + **Testcontainers** integration tests against real deps (Postgres/Redis/Temporal/S3/KMS); green & running at every commit. **No mocks/stubs in production code** — deps built in dependency order so nothing needs faking (ladder reordered: connections PR-12 before secret-resolving executors PR-13; interpreter skeleton uses a real node, not a no-op). Third-party SaaS exercised via **containerized boundary fakes** (WireMock/MockServer) or sandboxes — real network calls, not in-code mocks. Each PR carries a concrete `Tests:` line. _Captured in ADR-0017._

### Still-open domains (next sessions)
- Scaling / tenant isolation (task queues already partitioned by class; remaining: per-tenant queues, noisy-neighbor, rate-limiting, Redis/read-model fan-out at scale)
- Wait node: signal-based; how event-trigger system delivers the matching event
- Loop: ContinueAsNew vs child-workflow-per-iteration for very high counts

**[Data #3]: State lives outside Temporal** — Temporal holds only orchestration truth (current node, control flow). Canonical run data (node I/O) lives in Postgres; large payloads in S3, referenced by key. Workflow memory carries pointers + small promoted fields, not payloads. _Novelty:_ separates "what happened" from "the data"; directly feeds Run Detail (screen 8), which reads Postgres not Temporal.

### Reconciling #2 vs #3 — option space
- (A) Pure-with-promotion: activity returns small scalar result into workflow memory; conditions read only promoted fields; blobs never condition-referenceable.
- (B) Eval-in-activity: condition evaluation becomes an activity that reads Postgres/S3; full data access, costs latency + a history event per condition.
- (C) Hybrid by depth: scalars evaluated purely in-workflow; expressions touching large/blob fields trigger an activity fetch+eval.

### Open forks (parking lot)
- Source-of-truth on dual-write (Temporal history vs Postgres) if they disagree after a crash
- What gets "promoted" into condition-readable memory (all scalars / per-node output schema / user-tagged)
- Control-flow mapping: Parallel/Join, Map fan-out, Loop back-edges, Wait → Temporal primitives
