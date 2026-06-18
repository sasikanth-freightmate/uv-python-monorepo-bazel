"""Repository Protocols for the workflows context (ADR-0018, ADR-0019).

Only Protocol definitions live here — no implementations.
Concrete SQLAlchemy implementations are in infrastructure/workflows/repositories.py.
"""

from typing import Protocol

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.models import Workflow


class WorkflowRepository(Protocol):
    def add(self, workflow: Workflow) -> None: ...

    async def get(self, workflow_id: WorkflowId) -> Workflow | None: ...

    async def update_metadata(self, workflow: Workflow) -> None:
        """Persist workflow-level metadata (name, archived, updated_at)."""
        ...

    async def save_draft(self, workflow: Workflow) -> None:
        """Persist a mutated draft under optimistic concurrency.

        Raises ``StaleDraftRevision`` if the persisted ``draft_revision`` moved
        underneath this writer (a concurrent autosave won the race).
        """
        ...

    async def list_by_tenant(self, tenant_id: TenantId, limit: int, offset: int) -> list[Workflow]: ...
