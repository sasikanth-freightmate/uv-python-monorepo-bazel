from functools import reduce
from operator import mul


def add(a: int, b: int) -> int:
    return a + b


def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("n must be non-negative")
    return reduce(mul, range(1, n + 1), 1)


def is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True
