"""Workflows API endpoints — only layer that uses @inject (ADR-0019)."""

import uuid
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from apps.flow_backend.api.auth.dependencies import get_tenant_context
from apps.flow_backend.api.workflows.schemas import CreateDraftRequest, WorkflowResponse
from apps.flow_backend.application.workflows.use_cases import CreateDraft, GetWorkflow, PublishWorkflow
from apps.flow_backend.containers import ApplicationContainer
from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.infrastructure.auth.tenant_context import TenantContext

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/", status_code=201)
@inject
async def create_draft(
    body: CreateDraftRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    use_case: Annotated[CreateDraft, Depends(Provide[ApplicationContainer.workflows.create_draft])],
) -> dict:
    from apps.flow_backend.application.workflows.use_cases import CreateDraftCommand

    workflow_id = await use_case.execute(
        CreateDraftCommand(tenant_id=TenantId(ctx.org_id), name=body.name, graph=body.graph)
    )
    return {"workflow_id": str(workflow_id)}


@router.get("/{workflow_id}", response_model=WorkflowResponse)
@inject
async def get_workflow(
    workflow_id: uuid.UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    use_case: Annotated[GetWorkflow, Depends(Provide[ApplicationContainer.workflows.get_workflow])],
) -> WorkflowResponse:
    workflow = await use_case.execute(WorkflowId(workflow_id))
    return WorkflowResponse(
        id=workflow.id,
        tenant_id=workflow.tenant_id,
        name=workflow.name,
        status=workflow.status.value,
        version=workflow.version,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


@router.post("/{workflow_id}/publish", status_code=200)
@inject
async def publish_workflow(
    workflow_id: uuid.UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    use_case: Annotated[PublishWorkflow, Depends(Provide[ApplicationContainer.workflows.publish_workflow])],
) -> dict:
    from apps.flow_backend.application.workflows.use_cases import PublishWorkflowCommand

    await use_case.execute(PublishWorkflowCommand(workflow_id=WorkflowId(workflow_id), tenant_id=TenantId(ctx.org_id)))
    return {"status": "published"}
