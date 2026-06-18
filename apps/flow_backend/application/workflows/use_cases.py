"""Application use cases for the workflows context (ADR-0018).

One class per command. Use cases orchestrate domain logic via the UoW —
they never import from infrastructure directly.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.exceptions import WorkflowNotFound
from apps.flow_backend.domain.workflows.models import Workflow


@dataclass
class CreateWorkflowCommand:
    tenant_id: TenantId
    name: str
    content: dict | None = None
    created_by: str | None = None


@dataclass
class SaveDraftCommand:
    workflow_id: WorkflowId
    content: dict
    expected_revision: int
    updated_by: str | None = None


@dataclass
class UpdateWorkflowCommand:
    workflow_id: WorkflowId
    name: str | None = None
    archived: bool | None = None


@dataclass
class ListWorkflowsQuery:
    tenant_id: TenantId
    include_archived: bool = False
    limit: int = 50
    offset: int = 0


class CreateWorkflow:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: CreateWorkflowCommand) -> WorkflowId:
        async with self._uow_factory() as uow:
            workflow = Workflow.create(
                tenant_id=cmd.tenant_id,
                name=cmd.name,
                content=cmd.content,
                updated_by=cmd.created_by,
            )
            uow.workflows.add(workflow)
            return workflow.id


class SaveDraft:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: SaveDraftCommand) -> int:
        async with self._uow_factory() as uow:
            workflow = await uow.workflows.get(cmd.workflow_id)
            if workflow is None:
                raise WorkflowNotFound(cmd.workflow_id)
            workflow.save_draft(
                content=cmd.content,
                expected_revision=cmd.expected_revision,
                updated_by=cmd.updated_by,
            )
            await uow.workflows.save_draft(workflow)
            return workflow.draft.draft_revision


class UpdateWorkflow:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdateWorkflowCommand) -> Workflow:
        async with self._uow_factory() as uow:
            workflow = await uow.workflows.get(cmd.workflow_id)
            if workflow is None:
                raise WorkflowNotFound(cmd.workflow_id)
            if cmd.name is not None:
                workflow.rename(cmd.name)
            if cmd.archived is not None:
                workflow.set_archived(cmd.archived)
            await uow.workflows.update_metadata(workflow)
            return workflow


class ListWorkflows:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, query: ListWorkflowsQuery) -> list[Workflow]:
        async with self._uow_factory() as uow:
            workflows = await uow.workflows.list_by_tenant(
                query.tenant_id, limit=query.limit, offset=query.offset
            )
            if not query.include_archived:
                workflows = [w for w in workflows if not w.archived]
            return workflows


class GetWorkflow:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, workflow_id: WorkflowId) -> Workflow:
        async with self._uow_factory() as uow:
            workflow = await uow.workflows.get(workflow_id)
            if workflow is None:
                raise WorkflowNotFound(workflow_id)
            return workflow
