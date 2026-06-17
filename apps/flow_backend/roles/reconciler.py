"""Reconciler role — leader-elected control loop converging desired state to
Temporal Schedules (+ periodic jobs) (ADR-0006/0015).

PR-1: serves a liveness app only; the reconcile loop + leader election land later.
"""

from __future__ import annotations

from fastapi import FastAPI

from apps.flow_backend.config import Settings
from packages.service.health import build_health_app
from packages.service.runner import serve

LABEL = "flow-backend:reconciler"


def build_app() -> FastAPI:
    return build_health_app(LABEL)


async def run(settings: Settings) -> None:
    await serve(
        build_app(),
        host=settings.health_host,
        port=settings.health_port,
        log_level=settings.log_level,
    )
