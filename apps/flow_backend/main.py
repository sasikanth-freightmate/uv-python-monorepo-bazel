"""Single entrypoint for the flow-backend monolith.

One build, launched per role via `--role` (ADR-0015):

    bazel run //apps/flow_backend -- --role api
    ... worker | ingestion | gateway | reconciler
"""

from __future__ import annotations

import asyncio

from apps.flow_backend.config import Settings, parse_role
from apps.flow_backend.roles import get_runner
from packages.service.logging_setup import configure_logging


def main() -> None:
    role = parse_role()
    settings = Settings()
    configure_logging(settings.log_level)
    asyncio.run(get_runner(role)(settings))


if __name__ == "__main__":
    main()
