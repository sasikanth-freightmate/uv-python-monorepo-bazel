import unittest

from apps.workflows.example_graph import build_graph
from libs.workflow_engine.model import ready_nodes


class ExampleGraphRoutingTest(unittest.TestCase):
    def test_valid_order_routes_to_score(self):
        g = build_graph()
        outputs = {"validate": {"valid": True}}
        self.assertEqual(ready_nodes(g, outputs, {"validate"}), ["score"])

    def test_low_risk_routes_to_approve(self):
        g = build_graph()
        outputs = {"validate": {"valid": True}, "score": {"risk": "low"}}
        self.assertEqual(ready_nodes(g, outputs, {"validate", "score"}), ["approve"])

    def test_high_risk_routes_to_review(self):
        g = build_graph()
        outputs = {"validate": {"valid": True}, "score": {"risk": "high"}}
        self.assertEqual(ready_nodes(g, outputs, {"validate", "score"}), ["review"])

    def test_invalid_order_halts(self):
        g = build_graph()
        outputs = {"validate": {"valid": False}}
        self.assertEqual(ready_nodes(g, outputs, {"validate"}), [])


if __name__ == "__main__":
    unittest.main()
