"""Role registry: maps each Role to its async runner (ADR-0015)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from apps.flow_backend.config import Role, Settings
from apps.flow_backend.roles import api, gateway, ingestion, reconciler, worker

RoleRunner = Callable[[Settings], Awaitable[None]]

RUNNERS: dict[Role, RoleRunner] = {
    Role.API: api.run,
    Role.WORKER: worker.run,
    Role.INGESTION: ingestion.run,
    Role.GATEWAY: gateway.run,
    Role.RECONCILER: reconciler.run,
}


def get_runner(role: Role) -> RoleRunner:
    return RUNNERS[role]
