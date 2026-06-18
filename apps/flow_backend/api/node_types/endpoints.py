"""Node-types API endpoints — only layer that uses @inject (ADR-0019).

The registry is GLOBAL (no org scoping, no RLS — ADR-0009 / data model), so
these endpoints take no tenant context.
"""

from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from apps.flow_backend.api.node_types.schemas import NodeTypeResponse
from apps.flow_backend.application.node_types.use_cases import ListNodeTypes
from apps.flow_backend.containers import ApplicationContainer

router = APIRouter(prefix="/node-types", tags=["node-types"])


@router.get("", response_model=list[NodeTypeResponse])
@inject
async def list_node_types(
    use_case: Annotated[
        ListNodeTypes, Depends(Provide[ApplicationContainer.node_types.list_node_types])
    ],
) -> list[NodeTypeResponse]:
    manifests = await use_case.execute()
    return [NodeTypeResponse.from_manifest(m) for m in manifests]
