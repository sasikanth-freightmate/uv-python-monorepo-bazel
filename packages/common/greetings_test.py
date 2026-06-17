import unittest

from packages.common.greetings import make_greeting, shout


class MakeGreetingTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(make_greeting("world"), "Hello, world!")

    def test_unicode(self):
        self.assertEqual(make_greeting("世界"), "Hello, 世界!")

    def test_whitespace_preserved(self):
        self.assertEqual(make_greeting("  Alice  "), "Hello,   Alice  !")

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            make_greeting("")


class ShoutTest(unittest.TestCase):
    def test_uppercases(self):
        self.assertEqual(shout("hi"), "HI!")

    def test_already_upper(self):
        self.assertEqual(shout("HI"), "HI!")

    def test_empty(self):
        self.assertEqual(shout(""), "!")


if __name__ == "__main__":
    unittest.main()
