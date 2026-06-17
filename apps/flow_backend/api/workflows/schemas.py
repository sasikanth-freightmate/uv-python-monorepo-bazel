"""Pydantic request/response schemas for the workflows API (ADR-0018).

Never imported from domain/ — these are adapter-layer types only.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class CreateDraftRequest(BaseModel):
    name: str
    graph: dict | None = None


class PublishWorkflowRequest(BaseModel):
    tenant_id: uuid.UUID


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    status: str
    version: int
    created_at: datetime
    updated_at: datetime
