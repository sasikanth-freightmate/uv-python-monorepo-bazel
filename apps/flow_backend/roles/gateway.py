"""Gateway role — the self-hosted SSE realtime gateway (ADR-0004/0016).

PR-1: serves health only; SSE endpoints + Redis pub/sub mount in later PRs.
"""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.config import Settings
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:gateway"


def build_app() -> FastAPI:
    return build_health_app(LABEL)


async def run(settings: Settings) -> None:
    await serve(
        build_app(),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
