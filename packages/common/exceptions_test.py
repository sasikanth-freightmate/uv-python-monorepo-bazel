import unittest

from packages.common.exceptions import InfrastructureUnavailable


class InfrastructureUnavailableTest(unittest.TestCase):
    def test_stores_dependency_and_cause(self) -> None:
        cause = ConnectionError("timeout")
        exc = InfrastructureUnavailable("database", cause)
        self.assertEqual(exc.dependency, "database")
        self.assertIs(exc.cause, cause)

    def test_str_includes_dependency_and_cause(self) -> None:
        exc = InfrastructureUnavailable("redis", ValueError("refused"))
        self.assertIn("redis", str(exc))
        self.assertIn("refused", str(exc))

    def test_is_exception(self) -> None:
        self.assertIsInstance(InfrastructureUnavailable("db", Exception()), Exception)


if __name__ == "__main__":
    unittest.main()
