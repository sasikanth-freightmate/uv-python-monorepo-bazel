"""A demo graph: validate -> score -> (approve | review), routed by output.

Built with the pure layer-1 model, so it can be unit-tested without Temporal.
"""

from libs.workflow_engine.model import Edge, Graph, Node


def build_graph() -> Graph:
    return Graph(
        start="validate",
        nodes=[
            Node(id="validate", ref="validate"),
            Node(id="score", ref="score"),
            Node(id="approve", ref="approve"),
            Node(id="review", ref="review"),
        ],
        edges=[
            Edge(src="validate", dst="score", when={"valid": True}),
            Edge(src="score", dst="approve", when={"risk": "low"}),
            Edge(src="score", dst="review", when={"risk": "high"}),
        ],
    )
