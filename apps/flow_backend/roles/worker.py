"""Worker role — hosts Temporal workflows + activities (ADR-0001/0015).

PR-1: serves a liveness app only; the Temporal worker (interpreter, activities,
task-queue polling) is added in later PRs alongside this liveness server.
"""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.config import Settings
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:worker"


def build_app() -> FastAPI:
    return build_health_app(LABEL)


async def run(settings: Settings) -> None:
    await serve(
        build_app(),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
