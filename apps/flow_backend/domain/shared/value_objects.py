"""Shared value objects used across bounded contexts.

If a type appears in two domain/*/models.py files it belongs here (ADR-0018).
All value objects are immutable (frozen dataclass or NewType over UUID).
"""

import uuid
from typing import NewType

WorkflowId = NewType("WorkflowId", uuid.UUID)
TenantId = NewType("TenantId", uuid.UUID)


def new_workflow_id() -> WorkflowId:
    return WorkflowId(uuid.uuid4())


def new_tenant_id() -> TenantId:
    return TenantId(uuid.uuid4())
