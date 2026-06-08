import unittest

from libs.workflow_engine.model import Edge, Graph, Node, matches, node_map, ready_nodes


class MatchesTest(unittest.TestCase):
    def test_empty_condition_is_unconditional(self):
        self.assertTrue(matches(None, {"anything": 1}))
        self.assertTrue(matches({}, {"anything": 1}))

    def test_single_field_match(self):
        self.assertTrue(matches({"risk": "low"}, {"risk": "low", "extra": 9}))
        self.assertFalse(matches({"risk": "low"}, {"risk": "high"}))

    def test_multi_field_is_conjunction(self):
        self.assertTrue(matches({"a": 1, "b": 2}, {"a": 1, "b": 2, "c": 3}))
        self.assertFalse(matches({"a": 1, "b": 2}, {"a": 1, "b": 9}))

    def test_missing_field_does_not_match(self):
        self.assertFalse(matches({"risk": "low"}, {"other": "low"}))

    def test_non_dict_output_does_not_match(self):
        self.assertFalse(matches({"risk": "low"}, "not-a-dict"))


def _branching_graph() -> Graph:
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


class ReadyNodesTest(unittest.TestCase):
    def test_linear_step(self):
        g = _branching_graph()
        outputs = {"validate": {"valid": True}}
        self.assertEqual(ready_nodes(g, outputs, {"validate"}), ["score"])

    def test_conditional_picks_only_matching_branch(self):
        g = _branching_graph()
        outputs = {"score": {"risk": "low"}}
        self.assertEqual(ready_nodes(g, outputs, {"validate", "score"}), ["approve"])

    def test_other_branch(self):
        g = _branching_graph()
        outputs = {"score": {"risk": "high"}}
        self.assertEqual(ready_nodes(g, outputs, {"validate", "score"}), ["review"])

    def test_unsatisfied_condition_halts(self):
        g = _branching_graph()
        outputs = {"validate": {"valid": False}}
        self.assertEqual(ready_nodes(g, outputs, {"validate"}), [])

    def test_already_done_nodes_are_not_rerun(self):
        g = _branching_graph()
        outputs = {"validate": {"valid": True}, "score": {"risk": "low"}}
        done = {"validate", "score", "approve"}
        self.assertEqual(ready_nodes(g, outputs, done), [])

    def test_parallel_fan_out(self):
        g = Graph(
            start="a",
            nodes=[Node(id=n, ref=n) for n in ("a", "b", "c")],
            edges=[Edge(src="a", dst="b"), Edge(src="a", dst="c")],
        )
        outputs = {"a": {"ok": True}}
        self.assertEqual(ready_nodes(g, outputs, {"a"}), ["b", "c"])


class NodeMapTest(unittest.TestCase):
    def test_indexes_by_id(self):
        g = _branching_graph()
        self.assertEqual(node_map(g)["score"].ref, "score")


if __name__ == "__main__":
    unittest.main()
