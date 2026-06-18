"""Repository Protocol for the node-types context (ADR-0018, ADR-0019).

Only the Protocol lives here. The concrete SQLAlchemy implementation is in
infrastructure/node_types/repositories.py and satisfies this structurally.
"""

from typing import Protocol

from apps.flow_backend.domain.node_types.models import NodeTypeManifest


class NodeTypeRepository(Protocol):
    async def list_all(self) -> list[NodeTypeManifest]: ...

    async def get(self, type_id: str) -> NodeTypeManifest | None: ...

    async def upsert_many(self, manifests: list[NodeTypeManifest]) -> None: ...
