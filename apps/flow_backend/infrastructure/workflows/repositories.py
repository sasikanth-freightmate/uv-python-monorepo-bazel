"""Concrete SQLAlchemy implementation of WorkflowRepository (ADR-0018, ADR-0019).

Satisfies domain/workflows/repositories.py::WorkflowRepository Protocol
via structural subtyping — no explicit inheritance needed.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.models import WorkflowDraft, WorkflowStatus
from apps.flow_backend.infrastructure.workflows.orm import WorkflowORM
from packages.common.exceptions import InfrastructureUnavailable


def _to_domain(row: WorkflowORM) -> WorkflowDraft:
    return WorkflowDraft(
        id=WorkflowId(row.id),
        tenant_id=TenantId(row.tenant_id),
        name=row.name,
        status=WorkflowStatus(row.status),
        graph=row.graph,
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_orm(draft: WorkflowDraft) -> WorkflowORM:
    return WorkflowORM(
        id=draft.id,
        tenant_id=draft.tenant_id,
        name=draft.name,
        status=draft.status.value,
        graph=draft.graph,
        version=draft.version,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


class WorkflowSQLAlchemyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, workflow: WorkflowDraft) -> None:
        self._session.add(_to_orm(workflow))

    async def get(self, workflow_id: WorkflowId) -> WorkflowDraft | None:
        try:
            row = await self._session.get(WorkflowORM, workflow_id)
            return _to_domain(row) if row else None
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def list_by_tenant(self, tenant_id: TenantId, limit: int = 50, offset: int = 0) -> list[WorkflowDraft]:
        try:
            result = await self._session.execute(
                select(WorkflowORM)
                .where(WorkflowORM.tenant_id == tenant_id)
                .order_by(WorkflowORM.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            return [_to_domain(row) for row in result.scalars().all()]
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e
