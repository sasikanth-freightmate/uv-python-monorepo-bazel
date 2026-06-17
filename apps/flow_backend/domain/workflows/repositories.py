"""Repository Protocols for the workflows context (ADR-0018, ADR-0019).

Only Protocol definitions live here — no implementations.
Concrete SQLAlchemy implementations are in infrastructure/workflows/repositories.py.
"""

from typing import Protocol

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.models import WorkflowDraft


class WorkflowRepository(Protocol):
    def add(self, workflow: WorkflowDraft) -> None: ...

    async def get(self, workflow_id: WorkflowId) -> WorkflowDraft | None: ...

    async def list_by_tenant(self, tenant_id: TenantId, limit: int, offset: int) -> list[WorkflowDraft]: ...
