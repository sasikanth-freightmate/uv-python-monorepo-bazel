"""Temporal interpreter for the data-driven graph model (layer 2: durable execution).

Two rules make this "Temporal-style durable" and nothing more is required:

1. Determinism: this module does ZERO I/O and uses no wall-clock or randomness.
   All side effects live in activities. (The routing logic in `model` is pure.)
2. Idempotency: every activity receives a stable `idem_key` derived from
   (workflow_id, node_id). Temporal activities are at-least-once, so the activity
   makes its effect idempotent on this key (UPSERT to a deterministic row, or send
   it as an Idempotency-Key header) and re-execution never double-fires.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from libs.workflow_engine.model import Graph, Node, node_map, ready_nodes


@workflow.defn
class GraphWorkflow:
    """Generic interpreter: runs any Graph by routing on each node's output.

    The graph is pinned for the life of the run (it arrives as the workflow input),
    so edits to the graph definition never break an in-flight execution's replay.
    """

    @workflow.run
    async def run(self, graph: Graph, initial: dict | None = None) -> dict:
        outputs: dict = {}
        if initial is not None:
            outputs["__input__"] = initial
        nodes = node_map(graph)
        done: set[str] = set()
        frontier = [graph.start]

        while frontier:
            # Ready nodes in a frontier run concurrently (parallel fan-out).
            results = await asyncio.gather(
                *(self._run_node(nodes[nid], outputs) for nid in frontier)
            )
            for nid, out in zip(frontier, results):
                outputs[nid] = out
                done.add(nid)
            frontier = ready_nodes(graph, outputs, done)

        return outputs

    async def _run_node(self, node: Node, outputs: dict) -> object:
        idem_key = f"{workflow.info().workflow_id}:{node.id}"
        if node.kind == "workflow":
            return await workflow.execute_child_workflow(
                node.ref,
                args=[dict(outputs)],
                id=idem_key,
            )
        return await workflow.execute_activity(
            node.ref,
            args=[dict(outputs), idem_key],
            start_to_close_timeout=timedelta(seconds=node.timeout_seconds),
            retry_policy=RetryPolicy(maximum_attempts=node.max_attempts),
        )
