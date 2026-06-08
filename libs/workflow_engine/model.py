"""Pure, deterministic graph model for the durable workflow engine (layer 1).

This module has NO Temporal dependency and does NO I/O, so it is safe to import
inside a Temporal workflow sandbox and is fully unit-testable on its own.

Design decisions (from the v0 brainstorm):
- Workflows are *data*: a Graph is a serializable dataclass passed as the workflow
  input and pinned for the life of a run.
- A leaf node maps to a Temporal *activity* (where all I/O lives); a composite node
  maps to a *child workflow*.
- Edges route on a node's output using *declarative match* conditions only
  ({field: value}); an empty/None condition is an unconditional edge.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Node:
    """A unit of execution in the graph.

    `ref` is the registered name of the Temporal activity (kind == "activity") or
    the child workflow (kind == "workflow") that performs this node's work.
    """

    id: str
    ref: str
    kind: str = "activity"  # "activity" | "workflow"
    timeout_seconds: int = 1800  # per-node start-to-close timeout (30 min default)
    max_attempts: int = 5  # Temporal retry budget for the activity


@dataclass
class Edge:
    """A directed edge that fires when `when` matches the source node's output.

    `when` is a declarative match ({field: value}); None or {} is unconditional.
    """

    src: str
    dst: str
    when: dict | None = None


@dataclass
class Graph:
    """A workflow: a set of nodes and the edges that route between them."""

    start: str
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)


def node_map(graph: Graph) -> dict[str, Node]:
    return {n.id: n for n in graph.nodes}


def matches(condition: dict | None, output: object) -> bool:
    """True iff every key in `condition` equals output[key].

    An empty or None condition is an unconditional edge. Pure and deterministic, so
    it is safe to evaluate inside a Temporal workflow.
    """
    if not condition:
        return True
    if not isinstance(output, dict):
        return False
    return all(output.get(key) == value for key, value in condition.items())


def ready_nodes(graph: Graph, outputs: dict, done: set[str]) -> list[str]:
    """Next nodes to run: an unrun dst whose incoming edge matches its src output.

    A node fires when ANY satisfied incoming edge points to it. Full join/barrier
    semantics (wait for ALL upstreams) is deferred past v0.
    """
    ready: list[str] = []
    seen: set[str] = set()
    for edge in graph.edges:
        if (
            edge.src in outputs
            and edge.dst not in done
            and edge.dst not in seen
            and matches(edge.when, outputs[edge.src])
        ):
            ready.append(edge.dst)
            seen.add(edge.dst)
    return ready
