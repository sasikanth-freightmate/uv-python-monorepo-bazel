# Repository Structure

Bazel + bzlmod Python monorepo using `aspect_rules_py` for Python rules and `rules_uv` for dependency locking. Modeled on [`rules_py/examples/uv_pip_compile`](https://github.com/aspect-build/rules_py/tree/main/examples/uv_pip_compile).

## Layout

```
.
├── MODULE.bazel              # Bzlmod deps + Python toolchain + pypi hub
├── BUILD.bazel               # //:generate_requirements_txt (pip_compile)
├── .bazelversion             # 9.1.0
├── .bazelrc                  # build/test flags
├── .gitignore
├── requirements.in           # human-edited top-level deps
├── requirements.txt          # generated lockfile (uv pip-compile)
│
├── apps/                     # executable entrypoints (py_binary)
│   ├── hello/                #   cowsay-based hello app
│   │   ├── BUILD.bazel       #   hello_lib (py_library) + hello (py_binary) + hello_test (py_test)
│   │   ├── main.py
│   │   └── main_test.py
│   └── greeter/              #   rich-formatted greeter
│       ├── BUILD.bazel       #   greeter_lib + greeter + greeter_test
│       ├── main.py
│       └── main_test.py
│
└── libs/                     # reusable libraries (py_library, visibility=public)
    ├── common/               #   greeting helpers
    │   ├── BUILD.bazel       #   common (py_library) + greetings_test (py_test)
    │   ├── __init__.py
    │   ├── greetings.py
    │   └── greetings_test.py
    └── mathutils/            #   small numeric helpers
        ├── BUILD.bazel       #   mathutils + arithmetic_test
        ├── __init__.py
        ├── arithmetic.py
        └── arithmetic_test.py
```

## Conventions

- **Package layout**: every directory containing Python sources has a `BUILD.bazel`. Shared code goes under `libs/<name>/`, runnable entrypoints under `apps/<name>/`.
- **Imports**: each `py_library` / `py_binary` uses `imports = ["../.."]` so source files can `from libs.common.greetings import …` and `from apps.hello.main import …` using fully qualified paths rooted at the workspace.
- **Tests**: every package owns its tests as `<module>_test.py` next to the source, wired up via `py_test` in the same `BUILD.bazel`.
- **Binary + test pattern** (used by both apps): split logic into `<name>_lib` (`py_library`) so the binary and the test target both depend on it — avoids duplicating `srcs` and lets tests import the entrypoint module.
- **PyPI deps**: declared in `requirements.in`, locked via `bazel run //:generate_requirements_txt`, consumed in `BUILD.bazel` files as `@pypi//<package>` (e.g., `@pypi//cowsay`).
- **Visibility**: libraries under `libs/` are `//visibility:public`. App-internal `*_lib` targets stay package-default.

## Dependency versions (as of 2026-05-11)

| Module | Version |
|---|---|
| Bazel | 9.1.0 |
| `aspect_rules_py` | 1.11.5 |
| `rules_uv` | 0.89.2 |
| `rules_python` | 2.0.1 |
| `aspect_bazel_lib` | 2.22.5 |
| `rules_cc` | 0.2.18 |
| Python toolchain | 3.14.0 (highest currently pinned in rules_python 2.0.1) |

## Build & test policy

**This project uses Bazel exclusively.** Do not introduce or use any other build, test, packaging, or task-runner tooling. That means:

- No `pip install`, no `uv pip install`, no `uv run`, no `python -m venv`, no ad-hoc `python script.py` — running code happens through `bazel run`.
- No `pytest`, no `unittest` invoked directly — tests run through `bazel test`.
- No `make`, `nox`, `tox`, `poetry`, `hatch`, `pdm`, `setuptools`, `pip-tools`, or shell scripts that wrap build/test steps.
- No `pyproject.toml` / `setup.py` / `setup.cfg` for build configuration.
- `uv` is used *only* indirectly via `rules_uv`'s `pip_compile` rule to regenerate `requirements.txt`. It is never invoked directly from the shell.

All build, run, test, lint, and dependency-locking operations go through `bazel`.

## Dev container policy

**The compose stack in `.devcontainer/` is managed by DevPod.** Do not run `docker compose` (up/down/build/config/logs/etc.) directly against `.devcontainer/docker-compose.yml`. Use `devpod up`, `devpod stop`, and `devpod up --recreate` instead. Running raw compose commands can desync DevPod's state and leak orphan containers/volumes.

## Common commands

```bash
bazel run //:generate_requirements_txt     # regenerate requirements.txt from requirements.in
bazel build //...                          # build everything
bazel test //...                           # run all test targets
bazel run //apps/hello                     # run the hello binary
bazel run //apps/greeter                   # run the greeter binary
```

## Adding a new app

1. Create `apps/<name>/{BUILD.bazel, main.py, main_test.py}`.
2. In `BUILD.bazel`: declare `<name>_lib` (`py_library`), `<name>` (`py_binary`), and `<name>_test` (`py_test`); follow the pattern in `apps/hello/BUILD.bazel`.
3. For new PyPI deps, add to `requirements.in` and run `bazel run //:generate_requirements_txt`.

## Adding a new shared library

1. Create `libs/<name>/{BUILD.bazel, __init__.py, <module>.py, <module>_test.py}`.
2. Declare `py_library(name = "<name>", visibility = ["//visibility:public"], imports = ["../.."])`.
3. Consume from apps via `deps = ["//libs/<name>"]`.
