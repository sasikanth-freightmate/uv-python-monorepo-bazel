"""Concrete SQLAlchemy NodeTypeRepository (ADR-0018, ADR-0019).

Satisfies domain/node_types/repositories.py::NodeTypeRepository structurally.
The catalog is global and latest-only (ADR-0009): ``upsert_many`` re-seeds in
place via an ON CONFLICT update keyed on ``type_id``.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.node_types.models import (
    NodeTypeManifest,
    OutputSpec,
    StorageLane,
)
from apps.flow_backend.infrastructure.node_types.orm import NodeTypeManifestORM
from packages.common.exceptions import InfrastructureUnavailable


def _to_domain(row: NodeTypeManifestORM) -> NodeTypeManifest:
    return NodeTypeManifest(
        type_id=row.type_id,
        category=row.category,
        display=row.display,
        config_schema=row.config_schema,
        output_spec=OutputSpec.from_dict(row.output_spec),
        storage_lane=StorageLane(row.storage_lane),
        retry_safe=row.retry_safe,
    )


def _to_row(m: NodeTypeManifest) -> dict:
    return {
        "type_id": m.type_id,
        "category": m.category,
        "display": m.display,
        "config_schema": m.config_schema,
        "output_spec": m.output_spec.to_dict(),
        "storage_lane": m.storage_lane.value,
        "retry_safe": m.retry_safe,
    }


class NodeTypeSQLAlchemyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[NodeTypeManifest]:
        try:
            result = await self._session.execute(
                select(NodeTypeManifestORM).order_by(NodeTypeManifestORM.type_id)
            )
            return [_to_domain(row) for row in result.scalars().all()]
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def get(self, type_id: str) -> NodeTypeManifest | None:
        try:
            row = await self._session.get(NodeTypeManifestORM, type_id)
            return _to_domain(row) if row else None
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def upsert_many(self, manifests: list[NodeTypeManifest]) -> None:
        if not manifests:
            return
        try:
            for m in manifests:
                row = _to_row(m)
                stmt = insert(NodeTypeManifestORM).values(**row)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[NodeTypeManifestORM.type_id],
                    set_={k: row[k] for k in row if k != "type_id"},
                )
                await self._session.execute(stmt)
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e
