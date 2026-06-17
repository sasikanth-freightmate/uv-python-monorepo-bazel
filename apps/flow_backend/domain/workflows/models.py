"""Workflows aggregate — pure Python, no framework imports (ADR-0018).

WorkflowDraft is the aggregate root. It encapsulates all state transitions
and raises domain events on meaningful changes. The graph structure it holds
is deliberately kept as a plain dict for now; it will be replaced with the
typed Graph model from packages/workflow_engine in a later PR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId, new_workflow_id
from apps.flow_backend.domain.workflows.events import DomainEvent, WorkflowDraftCreated, WorkflowPublished
from apps.flow_backend.domain.workflows.exceptions import WorkflowAlreadyPublished


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


@dataclass
class WorkflowDraft:
    """Aggregate root for a workflow definition."""

    id: WorkflowId
    tenant_id: TenantId
    name: str
    status: WorkflowStatus
    graph: dict
    version: int
    created_at: datetime
    updated_at: datetime
    _events: list[DomainEvent] = field(default_factory=list, repr=False, compare=False)

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(cls, tenant_id: TenantId, name: str, graph: dict | None = None) -> WorkflowDraft:
        now = datetime.now(tz=timezone.utc)
        workflow_id = new_workflow_id()
        draft = cls(
            id=workflow_id,
            tenant_id=tenant_id,
            name=name,
            status=WorkflowStatus.DRAFT,
            graph=graph or {},
            version=0,
            created_at=now,
            updated_at=now,
        )
        draft._events.append(WorkflowDraftCreated(workflow_id=workflow_id, tenant_id=tenant_id, name=name))
        return draft

    # ── Commands ──────────────────────────────────────────────────────────────

    def publish(self) -> None:
        if self.status == WorkflowStatus.PUBLISHED:
            raise WorkflowAlreadyPublished(self.id)
        self.status = WorkflowStatus.PUBLISHED
        self.version += 1
        self.updated_at = datetime.now(tz=timezone.utc)
        self._events.append(WorkflowPublished(workflow_id=self.id, tenant_id=self.tenant_id, version=self.version))

    def update_graph(self, graph: dict) -> None:
        self.graph = graph
        self.updated_at = datetime.now(tz=timezone.utc)

    # ── Event collection ──────────────────────────────────────────────────────

    def pop_events(self) -> list[DomainEvent]:
        events, self._events = self._events, []
        return events
