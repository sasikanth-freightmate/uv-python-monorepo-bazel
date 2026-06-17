"""API role — the synchronous control-plane (drafts, publish, routing, …).

PR-1: serves health only; REST routers mount onto `build_app()` in later PRs.
"""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.api.exception_handlers import register_handlers
from apps.flow_backend.api.workflows.endpoints import router as workflows_router
from apps.flow_backend.config import Settings
from apps.flow_backend.containers import ApplicationContainer
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:api"


def build_app() -> FastAPI:
    container = ApplicationContainer()
    app = build_health_app(LABEL)
    app.container = container  # type: ignore[attr-defined]
    register_handlers(app)
    app.include_router(workflows_router, prefix="/api/v1")
    return app


async def run(settings: Settings) -> None:
    await serve(
        build_app(),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
