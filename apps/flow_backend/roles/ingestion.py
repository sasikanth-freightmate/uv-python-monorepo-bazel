"""Ingestion role — receives, dedups, and matches events (ADR-0006).

PR-1: serves a liveness app only; the event consumer + matcher is added later.
"""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.config import Settings
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:ingestion"


def build_app() -> FastAPI:
    return build_health_app(LABEL)


async def run(settings: Settings) -> None:
    await serve(
        build_app(),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
