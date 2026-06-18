"""Domain events raised by the workflows aggregate.

Events are collected on the aggregate via pop_events() and dispatched by the
Unit of Work after the DB transaction commits (ADR-0020, ADR-0021).
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId


@dataclass(frozen=True)
class DomainEvent:
    event_id: uuid.UUID = field(default_factory=uuid.uuid4)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))

    def to_dict(self) -> dict:
        raise NotImplementedError


@dataclass(frozen=True)
class WorkflowCreated(DomainEvent):
    workflow_id: WorkflowId = field(default_factory=lambda: WorkflowId(uuid.uuid4()))
    tenant_id: TenantId = field(default_factory=lambda: TenantId(uuid.uuid4()))
    name: str = ""

    def to_dict(self) -> dict:
        return {
            "workflow_id": str(self.workflow_id),
            "tenant_id": str(self.tenant_id),
            "name": self.name,
            "occurred_at": self.occurred_at.isoformat(),
        }


@dataclass(frozen=True)
class DraftSaved(DomainEvent):
    workflow_id: WorkflowId = field(default_factory=lambda: WorkflowId(uuid.uuid4()))
    tenant_id: TenantId = field(default_factory=lambda: TenantId(uuid.uuid4()))
    draft_revision: int = 0

    def to_dict(self) -> dict:
        return {
            "workflow_id": str(self.workflow_id),
            "tenant_id": str(self.tenant_id),
            "draft_revision": self.draft_revision,
            "occurred_at": self.occurred_at.isoformat(),
        }


@dataclass(frozen=True)
class WorkflowRenamed(DomainEvent):
    workflow_id: WorkflowId = field(default_factory=lambda: WorkflowId(uuid.uuid4()))
    tenant_id: TenantId = field(default_factory=lambda: TenantId(uuid.uuid4()))
    name: str = ""

    def to_dict(self) -> dict:
        return {
            "workflow_id": str(self.workflow_id),
            "tenant_id": str(self.tenant_id),
            "name": self.name,
            "occurred_at": self.occurred_at.isoformat(),
        }


@dataclass(frozen=True)
class WorkflowArchivedChanged(DomainEvent):
    workflow_id: WorkflowId = field(default_factory=lambda: WorkflowId(uuid.uuid4()))
    tenant_id: TenantId = field(default_factory=lambda: TenantId(uuid.uuid4()))
    archived: bool = False

    def to_dict(self) -> dict:
        return {
            "workflow_id": str(self.workflow_id),
            "tenant_id": str(self.tenant_id),
            "archived": self.archived,
            "occurred_at": self.occurred_at.isoformat(),
        }
