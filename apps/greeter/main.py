from rich.console import Console

from libs.common.greetings import make_greeting, shout
from libs.mathutils.arithmetic import factorial


def format_line(name: str, n: int) -> str:
    return f"{shout(make_greeting(name))} ({n}! = {factorial(n)})"


if __name__ == "__main__":
    Console().print(f"[bold green]{format_line('greeter app', 5)}[/]")
