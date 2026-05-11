import unittest

from apps.hello.main import render


class RenderTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(render("monorepo"), "Hello, monorepo!")

    def test_distinct(self):
        self.assertNotEqual(render("a"), render("b"))

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            render("")


if __name__ == "__main__":
    unittest.main()
