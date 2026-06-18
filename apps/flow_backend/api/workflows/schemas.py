"""Pydantic request/response schemas for the workflows API (ADR-0018).

Never imported from domain/ — these are adapter-layer types only.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class CreateWorkflowRequest(BaseModel):
    name: str
    content: dict | None = None


class CreateWorkflowResponse(BaseModel):
    workflow_id: uuid.UUID


class UpdateWorkflowRequest(BaseModel):
    # Partial update: only the provided fields change (rename / archive).
    name: str | None = None
    archived: bool | None = None


class WorkflowSummaryResponse(BaseModel):
    """List-view shape — workflow metadata without the (potentially large) draft."""

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    status: str
    archived: bool
    created_at: datetime
    updated_at: datetime


class SaveDraftRequest(BaseModel):
    content: dict
    # The revision the editor last saw; a mismatch means a newer save won (409).
    draft_revision: int


class SaveDraftResponse(BaseModel):
    draft_revision: int


class DraftResponse(BaseModel):
    content: dict
    content_hash: str | None
    draft_revision: int
    base_version_id: uuid.UUID | None
    updated_by: str | None
    updated_at: datetime | None


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    status: str
    archived: bool
    created_at: datetime
    updated_at: datetime
    draft: DraftResponse
