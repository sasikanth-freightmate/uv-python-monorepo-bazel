"""API role — the synchronous control-plane (drafts, publish, routing, …)."""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.api.auth.endpoints import router as auth_router
from apps.flow_backend.api.exception_handlers import register_handlers
from apps.flow_backend.api.node_types.endpoints import router as node_types_router
from apps.flow_backend.api.workflows.endpoints import router as workflows_router
from apps.flow_backend.config import Settings
from apps.flow_backend.containers import ApplicationContainer
from dependency_injector import providers
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:api"


def build_app(settings: Settings | None = None) -> FastAPI:
    """Build the API ASGI app.

    When *settings* is provided (production path via ``run()``), the
    already-validated instance is wired into the container so Settings is
    constructed exactly once per process.  When omitted (e.g. in unit tests
    that only hit the health endpoint), the container creates Settings lazily
    from the environment on first use.
    """
    container = ApplicationContainer()
    if settings is not None:
        container.settings.override(providers.Object(settings))
    app = build_health_app(LABEL)
    app.container = container  # type: ignore[attr-defined]
    register_handlers(app)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(workflows_router, prefix="/api/v1")
    app.include_router(node_types_router, prefix="/api/v1")

    @app.on_event("startup")
    async def _seed_node_type_catalog() -> None:
        # The built-in catalog is global, latest-only config (ADR-0009); upsert
        # it on boot so a deployed control-plane always serves the current set.
        await container.node_types.seed_catalog().execute()

    return app


async def run(settings: Settings) -> None:
    await serve(
        build_app(settings),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
