"""Workflows API endpoints — only layer that uses @inject (ADR-0019).

Authoring CRUD for v1 (PR-5): list / create / read a workflow with its draft,
update metadata (rename, archive), and autosave the draft under optimistic
concurrency. Writes require the EDITOR role (ADR-0011); reads are open to any
org member. Validation lands in PR-6, publish/versions in PR-7.
"""

import uuid
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query

from apps.flow_backend.api.auth.dependencies import get_tenant_context, require_role
from apps.flow_backend.api.workflows.schemas import (
    CreateWorkflowRequest,
    CreateWorkflowResponse,
    DraftResponse,
    SaveDraftRequest,
    SaveDraftResponse,
    UpdateWorkflowRequest,
    WorkflowResponse,
    WorkflowSummaryResponse,
)
from apps.flow_backend.application.workflows.use_cases import (
    CreateWorkflow,
    CreateWorkflowCommand,
    GetWorkflow,
    ListWorkflows,
    ListWorkflowsQuery,
    SaveDraft,
    SaveDraftCommand,
    UpdateWorkflow,
    UpdateWorkflowCommand,
)
from apps.flow_backend.containers import ApplicationContainer
from apps.flow_backend.domain.identity.models import Role
from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.models import Workflow
from apps.flow_backend.infrastructure.auth.tenant_context import TenantContext

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _to_response(workflow: Workflow) -> WorkflowResponse:
    return WorkflowResponse(
        id=workflow.id,
        tenant_id=workflow.tenant_id,
        name=workflow.name,
        status=workflow.status.value,
        archived=workflow.archived,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        draft=DraftResponse(
            content=workflow.draft.content,
            content_hash=workflow.draft.content_hash,
            draft_revision=workflow.draft.draft_revision,
            base_version_id=workflow.draft.base_version_id,
            updated_by=workflow.draft.updated_by,
            updated_at=workflow.draft.updated_at,
        ),
    )


@router.get("/", response_model=list[WorkflowSummaryResponse])
@inject
async def list_workflows(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    use_case: Annotated[ListWorkflows, Depends(Provide[ApplicationContainer.workflows.list_workflows])],
    include_archived: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[WorkflowSummaryResponse]:
    workflows = await use_case.execute(
        ListWorkflowsQuery(
            tenant_id=TenantId(ctx.org_id),
            include_archived=include_archived,
            limit=limit,
            offset=offset,
        )
    )
    return [
        WorkflowSummaryResponse(
            id=w.id,
            tenant_id=w.tenant_id,
            name=w.name,
            status=w.status.value,
            archived=w.archived,
            created_at=w.created_at,
            updated_at=w.updated_at,
        )
        for w in workflows
    ]


@router.post("/", status_code=201, response_model=CreateWorkflowResponse)
@inject
async def create_workflow(
    body: CreateWorkflowRequest,
    ctx: Annotated[TenantContext, Depends(require_role(Role.EDITOR))],
    use_case: Annotated[CreateWorkflow, Depends(Provide[ApplicationContainer.workflows.create_workflow])],
) -> CreateWorkflowResponse:
    workflow_id = await use_case.execute(
        CreateWorkflowCommand(
            tenant_id=TenantId(ctx.org_id),
            name=body.name,
            content=body.content,
            created_by=ctx.sub,
        )
    )
    return CreateWorkflowResponse(workflow_id=workflow_id)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
@inject
async def get_workflow(
    workflow_id: uuid.UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    use_case: Annotated[GetWorkflow, Depends(Provide[ApplicationContainer.workflows.get_workflow])],
) -> WorkflowResponse:
    workflow = await use_case.execute(WorkflowId(workflow_id))
    return _to_response(workflow)


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
@inject
async def update_workflow(
    workflow_id: uuid.UUID,
    body: UpdateWorkflowRequest,
    ctx: Annotated[TenantContext, Depends(require_role(Role.EDITOR))],
    use_case: Annotated[UpdateWorkflow, Depends(Provide[ApplicationContainer.workflows.update_workflow])],
) -> WorkflowResponse:
    workflow = await use_case.execute(
        UpdateWorkflowCommand(
            workflow_id=WorkflowId(workflow_id),
            name=body.name,
            archived=body.archived,
        )
    )
    return _to_response(workflow)


@router.put("/{workflow_id}/draft", response_model=SaveDraftResponse)
@inject
async def save_draft(
    workflow_id: uuid.UUID,
    body: SaveDraftRequest,
    ctx: Annotated[TenantContext, Depends(require_role(Role.EDITOR))],
    use_case: Annotated[SaveDraft, Depends(Provide[ApplicationContainer.workflows.save_draft])],
) -> SaveDraftResponse:
    new_revision = await use_case.execute(
        SaveDraftCommand(
            workflow_id=WorkflowId(workflow_id),
            content=body.content,
            expected_revision=body.draft_revision,
            updated_by=ctx.sub,
        )
    )
    return SaveDraftResponse(draft_revision=new_revision)
