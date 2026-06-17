"""Reusable health/liveness ASGI app — `/health` and `/ready` for any service."""

from __future__ import annotations

from fastapi import FastAPI


def build_health_app(label: str) -> FastAPI:
    """A FastAPI app exposing liveness/readiness, tagged with a service label."""
    app = FastAPI(title=label)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": label}

    @app.get("/ready")
    def ready() -> dict[str, str]:
        return {"status": "ready", "service": label}

    return app
