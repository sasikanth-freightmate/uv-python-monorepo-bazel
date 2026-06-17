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
class WorkflowDraftCreated(DomainEvent):
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
class WorkflowPublished(DomainEvent):
    workflow_id: WorkflowId = field(default_factory=lambda: WorkflowId(uuid.uuid4()))
    tenant_id: TenantId = field(default_factory=lambda: TenantId(uuid.uuid4()))
    version: int = 1

    def to_dict(self) -> dict:
        return {
            "workflow_id": str(self.workflow_id),
            "tenant_id": str(self.tenant_id),
            "version": self.version,
            "occurred_at": self.occurred_at.isoformat(),
        }
