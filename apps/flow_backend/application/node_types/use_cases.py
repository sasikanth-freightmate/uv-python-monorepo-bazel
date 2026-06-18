"""Application use cases for the node-types context (ADR-0018).

Use cases orchestrate via the UoW and never import infrastructure directly.
"""

from __future__ import annotations

from collections.abc import Callable

from apps.flow_backend.domain.node_types.catalog import BUILTIN_CATALOG
from apps.flow_backend.domain.node_types.models import NodeTypeManifest


class ListNodeTypes:
    """Serve the built-in catalog from the registry (GET /node-types)."""

    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self) -> list[NodeTypeManifest]:
        async with self._uow_factory() as uow:
            return await uow.node_types.list_all()


class SeedCatalog:
    """Upsert the built-in catalog into the registry (idempotent, latest-only).

    Run on API startup so a deployed control-plane always serves the current
    catalog; also callable directly (tests, a one-off seed job).
    """

    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, catalog: list[NodeTypeManifest] | None = None) -> int:
        manifests = BUILTIN_CATALOG if catalog is None else catalog
        async with self._uow_factory() as uow:
            await uow.node_types.upsert_many(manifests)
        return len(manifests)
