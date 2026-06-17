import unittest

from packages.mathutils.arithmetic import add, factorial, is_prime


class AddTest(unittest.TestCase):
    def test_positive(self):
        self.assertEqual(add(2, 3), 5)

    def test_negative(self):
        self.assertEqual(add(-4, -6), -10)

    def test_zero(self):
        self.assertEqual(add(0, 0), 0)


class FactorialTest(unittest.TestCase):
    def test_zero(self):
        self.assertEqual(factorial(0), 1)

    def test_one(self):
        self.assertEqual(factorial(1), 1)

    def test_five(self):
        self.assertEqual(factorial(5), 120)

    def test_ten(self):
        self.assertEqual(factorial(10), 3628800)

    def test_negative_raises(self):
        with self.assertRaises(ValueError):
            factorial(-1)


class IsPrimeTest(unittest.TestCase):
    def test_small_primes(self):
        for p in (2, 3, 5, 7, 11, 13):
            self.assertTrue(is_prime(p), f"{p} should be prime")

    def test_small_composites(self):
        for c in (0, 1, 4, 6, 8, 9, 10, 15):
            self.assertFalse(is_prime(c), f"{c} should not be prime")

    def test_large_prime(self):
        self.assertTrue(is_prime(7919))

    def test_large_composite(self):
        self.assertFalse(is_prime(7920))

    def test_negative(self):
        self.assertFalse(is_prime(-7))


if __name__ == "__main__":
    unittest.main()
