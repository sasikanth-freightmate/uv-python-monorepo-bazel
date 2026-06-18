"""Apply Alembic migrations to head.

    bazel run //apps/flow_backend:migrate

URL resolution lives in migrations/env.py (first wins): an injected ``db_url``
(tests) → ``MIGRATION_DATABASE_URL`` (the privileged owner role) → ``Settings``.
So this connects as the owner when MIGRATION_DATABASE_URL is set, never as the
least-privilege ``flow`` role the services use.
"""

from __future__ import annotations

import logging
import os

from alembic import command
from alembic.config import Config


def _config() -> Config:
    cfg = Config()
    # Resolve the migrations dir relative to this file so it works regardless of
    # the process working directory (bazel run, CLI, …).
    cfg.set_main_option(
        "script_location",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations"),
    )
    return cfg


def main() -> None:
    # Programmatic Config() skips alembic.ini's logging setup, so configure it
    # here to surface alembic's INFO output (which revision it applies, etc.).
    logging.basicConfig(level=logging.INFO, format="%(levelname)-5.5s [%(name)s] %(message)s")
    logging.getLogger("alembic").setLevel(logging.INFO)
    command.upgrade(_config(), "head")


if __name__ == "__main__":
    main()
