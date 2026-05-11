import unittest

from apps.greeter.main import format_line


class FormatLineTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(
            format_line("world", 5),
            "HELLO, WORLD!! (5! = 120)",
        )

    def test_zero_factorial(self):
        self.assertEqual(
            format_line("you", 0),
            "HELLO, YOU!! (0! = 1)",
        )

    def test_distinct_names(self):
        self.assertNotEqual(format_line("a", 3), format_line("b", 3))

    def test_negative_factorial_raises(self):
        with self.assertRaises(ValueError):
            format_line("x", -1)


if __name__ == "__main__":
    unittest.main()
