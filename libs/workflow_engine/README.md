# workflow_engine — durable, node-graph workflows

A custom node-graph workflow model executed durably on **Temporal**. Workflows are
directed graphs of nodes; each node's **output** routes execution to the next nodes.

## The two-layer design

| Layer | What | Where |
|---|---|---|
| **1. Graph model** *(our IP)* | Node/Edge/Graph data model + the pure routing logic | `model.py` |
| **2. Durable execution** *(adopted: Temporal)* | Persist state, retry, survive crashes, scale workers, don't double-fire | `workflow.py` + Temporal |

Layer 1 has **no Temporal dependency** and does **no I/O** — it is safe to import
inside a Temporal workflow sandbox and is fully unit-testable on its own
(`model_test.py`).

## Decisions (from the v0 brainstorm)

Profile that drove these: runs take **minutes–hours**, graphs authored in **Python**,
nodes **call external APIs / write DBs (must-not-double-fire)**, **10k+ runs/day**,
targets **mostly support idempotency keys / we own the DBs**, **one system per node**.

- **Adopt Temporal, don't build the engine.** The hard part (exactly-once-ish side
  effects + retries + crash recovery at scale) is commodity infrastructure; only the
  graph model is ours.
- **Graph as data.** A `Graph` is a serializable dataclass passed as the workflow
  input and **pinned** for the life of a run, so editing a graph never breaks an
  in-flight execution's replay.
- **Node → primitive mapping:** leaf node = Temporal **activity** (all I/O here);
  composite node (`kind="workflow"`) = **child workflow**.
- **Routing = declarative match only.** Edges carry `{field: value}` conditions on the
  source node's output; empty/None = unconditional. No predicate registry, no DSL in
  v0 (add later only if non-engineers author graphs).
- **No saga in v0.** One side effect per node + idempotency makes compensation
  unnecessary for now.

## The two rules that make it durable (and nothing more)

1. **Determinism** — `workflow.py` and all routing do zero I/O, no wall-clock, no
   randomness. Break this and replay corrupts.
2. **Idempotency** — every activity gets a stable `idem_key = "{workflow_id}:{node_id}"`.
   Temporal activities are **at-least-once**, so the activity makes its effect
   idempotent on this key (UPSERT to a deterministic row, or send it as an
   `Idempotency-Key` header). **Never** put `activity.info().attempt` in the key — it
   changes per retry and defeats dedupe.

## Run it locally

The devcontainer's `docker-compose.yml` runs a `temporal` dev server (gRPC `:7233`,
Web UI <http://localhost:8233>). The `dev` service gets `TEMPORAL_ADDRESS=temporal:7233`.

```bash
# 1. add the dep to the lock (one-time, after editing requirements.in)
bazel run //:generate_requirements_txt

# 2. run the pure model tests (no Temporal needed)
bazel test //libs/workflow_engine:model_test //apps/workflows:example_graph_test

# 3. start a worker (long-running)
bazel run //apps/workflows:worker

# 4. in another shell, kick off a run
bazel run //apps/workflows:starter
```

## v0 milestone ladder

1. `temporal` service up; Web UI loads on `:8233`
2. `temporalio` resolves through Bazel; worker connects + polls
3. Linear graph runs end-to-end (an activity does a real effect with an idem-key)
4. Output-based routing (conditional edge) + parallel fan-out — *done in the model*
5. Composite node → child workflow (`kind="workflow"` is wired; add an example)
6. Kill the worker mid-run; confirm it **resumes** from history — the payoff demo

## Known risks to watch (from the pre-mortem)

- **Python 3.14 + `temporalio` wheels.** `temporalio` ships a compiled core; confirm a
  cp314 wheel exists for the container arch, else pin Python or build from sdist (Rust).
- **Determinism violations** — never import I/O libs into `workflow.py`.
- **History size** on huge graphs/loops — use `continue-as-new` / child workflows.
- **Join semantics** — v0 fires a node on ANY satisfied incoming edge; true
  wait-for-all barriers are deferred.
