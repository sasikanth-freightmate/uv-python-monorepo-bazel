"""Application use cases for the workflows context (ADR-0018).

One class per command. Use cases orchestrate domain logic via the UoW —
they never import from infrastructure directly.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.exceptions import WorkflowNotFound
from apps.flow_backend.domain.workflows.models import WorkflowDraft


@dataclass
class CreateDraftCommand:
    tenant_id: TenantId
    name: str
    graph: dict | None = None


@dataclass
class PublishWorkflowCommand:
    workflow_id: WorkflowId
    tenant_id: TenantId


class CreateDraft:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: CreateDraftCommand) -> WorkflowId:
        async with self._uow_factory() as uow:
            draft = WorkflowDraft.create(
                tenant_id=cmd.tenant_id,
                name=cmd.name,
                graph=cmd.graph,
            )
            uow.workflows.add(draft)
            return draft.id


class PublishWorkflow:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: PublishWorkflowCommand) -> None:
        async with self._uow_factory() as uow:
            workflow = await uow.workflows.get(cmd.workflow_id)
            if workflow is None:
                raise WorkflowNotFound(cmd.workflow_id)
            workflow.publish()


class GetWorkflow:
    def __init__(self, uow_factory: Callable) -> None:
        self._uow_factory = uow_factory

    async def execute(self, workflow_id: WorkflowId) -> WorkflowDraft:
        async with self._uow_factory() as uow:
            workflow = await uow.workflows.get(workflow_id)
            if workflow is None:
                raise WorkflowNotFound(workflow_id)
            return workflow
