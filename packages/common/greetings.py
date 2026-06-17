def make_greeting(name: str) -> str:
    if not name:
        raise ValueError("name must not be empty")
    return f"Hello, {name}!"


def shout(message: str) -> str:
    return message.upper() + "!"
