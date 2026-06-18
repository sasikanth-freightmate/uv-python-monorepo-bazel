"""Concrete SQLAlchemy implementation of WorkflowRepository (ADR-0018, ADR-0019).

Satisfies domain/workflows/repositories.py::WorkflowRepository Protocol
via structural subtyping — no explicit inheritance needed.

A ``Workflow`` aggregate spans three tables: ``workflows`` (metadata),
``workflow_drafts`` (the single mutable graph) and ``node_usages`` (the derived
index). ``add`` inserts all three; ``save_draft`` updates the draft under
optimistic concurrency and rebuilds the draft's node_usages. RLS scopes every
statement to the session's active org (infrastructure.database).
"""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.exceptions import StaleDraftRevision
from apps.flow_backend.domain.workflows.models import Workflow, WorkflowDraft, WorkflowStatus
from apps.flow_backend.infrastructure.workflows.orm import (
    NodeUsageORM,
    WorkflowDraftORM,
    WorkflowORM,
)
from packages.common.exceptions import InfrastructureUnavailable


def _to_domain(wf: WorkflowORM, draft: WorkflowDraftORM) -> Workflow:
    return Workflow(
        id=WorkflowId(wf.id),
        tenant_id=TenantId(wf.tenant_id),
        name=wf.name,
        status=WorkflowStatus(wf.status),
        archived=wf.archived,
        draft=WorkflowDraft(
            content=draft.content,
            content_hash=draft.content_hash,
            draft_revision=draft.draft_revision,
            base_version_id=draft.base_version_id,
            updated_by=draft.updated_by,
            updated_at=draft.updated_at,
        ),
        created_at=wf.created_at,
        updated_at=wf.updated_at,
    )


class WorkflowSQLAlchemyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, workflow: Workflow) -> None:
        draft = workflow.draft
        wf_orm = WorkflowORM(
            id=workflow.id,
            tenant_id=workflow.tenant_id,
            name=workflow.name,
            status=workflow.status.value,
            archived=workflow.archived,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
        )
        # Attach children via the relationships so the unit of work inserts the
        # workflow row before its draft / node_usages (which FK back to it).
        wf_orm.draft = WorkflowDraftORM(
            tenant_id=workflow.tenant_id,
            content=draft.content,
            content_hash=draft.content_hash,
            base_version_id=draft.base_version_id,
            draft_revision=draft.draft_revision,
            updated_by=draft.updated_by,
            updated_at=draft.updated_at,
        )
        wf_orm.node_usages = [
            NodeUsageORM(
                id=uuid.uuid4(),
                tenant_id=workflow.tenant_id,
                version_id=None,  # NULL = the draft
                type_id=usage.type_id,
                connection_id=usage.connection_id,
                node_path=usage.node_path,
            )
            for usage in workflow.draft.node_usages()
        ]
        self._session.add(wf_orm)

    async def get(self, workflow_id: WorkflowId) -> Workflow | None:
        try:
            wf = await self._session.get(WorkflowORM, workflow_id)
            if wf is None:
                return None
            draft = await self._session.get(WorkflowDraftORM, workflow_id)
            if draft is None:
                return None
            return _to_domain(wf, draft)
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def update_metadata(self, workflow: Workflow) -> None:
        try:
            await self._session.execute(
                update(WorkflowORM)
                .where(WorkflowORM.id == workflow.id)
                .values(
                    name=workflow.name,
                    archived=workflow.archived,
                    updated_at=workflow.updated_at,
                )
            )
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def save_draft(self, workflow: Workflow) -> None:
        draft = workflow.draft
        # The aggregate already incremented; persist conditionally on the prior
        # revision so a concurrent autosave that landed first is rejected.
        prev_revision = draft.draft_revision - 1
        try:
            result = await self._session.execute(
                update(WorkflowDraftORM)
                .where(
                    WorkflowDraftORM.workflow_id == workflow.id,
                    WorkflowDraftORM.draft_revision == prev_revision,
                )
                .values(
                    content=draft.content,
                    content_hash=draft.content_hash,
                    draft_revision=draft.draft_revision,
                    updated_by=draft.updated_by,
                    updated_at=draft.updated_at,
                )
            )
            if result.rowcount == 0:
                raise StaleDraftRevision(
                    workflow.id, expected=prev_revision, actual=draft.draft_revision
                )
            await self._session.execute(
                update(WorkflowORM)
                .where(WorkflowORM.id == workflow.id)
                .values(updated_at=workflow.updated_at)
            )
            await self._rebuild_draft_node_usages(workflow)
        except StaleDraftRevision:
            raise
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def list_by_tenant(self, tenant_id: TenantId, limit: int = 50, offset: int = 0) -> list[Workflow]:
        try:
            result = await self._session.execute(
                select(WorkflowORM, WorkflowDraftORM)
                .join(WorkflowDraftORM, WorkflowDraftORM.workflow_id == WorkflowORM.id)
                .where(WorkflowORM.tenant_id == tenant_id)
                .order_by(WorkflowORM.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            return [_to_domain(wf, draft) for wf, draft in result.all()]
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    # ── node_usages (derived index, rebuilt from content) ─────────────────────

    def _add_node_usages(self, workflow: Workflow) -> None:
        for usage in workflow.draft.node_usages():
            self._session.add(
                NodeUsageORM(
                    id=uuid.uuid4(),
                    tenant_id=workflow.tenant_id,
                    workflow_id=workflow.id,
                    version_id=None,  # NULL = the draft
                    type_id=usage.type_id,
                    connection_id=usage.connection_id,
                    node_path=usage.node_path,
                )
            )

    async def _rebuild_draft_node_usages(self, workflow: Workflow) -> None:
        await self._session.execute(
            delete(NodeUsageORM).where(
                NodeUsageORM.workflow_id == workflow.id,
                NodeUsageORM.version_id.is_(None),
            )
        )
        self._add_node_usages(workflow)
