import cowsay

from libs.common.greetings import make_greeting


def render(name: str) -> str:
    return make_greeting(name)


if __name__ == "__main__":
    cowsay.cow(render("monorepo"))
