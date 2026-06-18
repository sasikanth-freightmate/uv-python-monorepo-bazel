"""SQLAlchemy ORM models for the workflows context.

Kept separate from domain models (ADR-0018) — domain models are pure Python,
ORM models are an infrastructure detail. Mapping between the two happens in
the repository implementation.

The persistence split mirrors the data model (ADR-0007): ``workflows`` holds
metadata, ``workflow_drafts`` holds the single mutable graph (1:1), and
``node_usages`` is the derived index rebuilt from the draft's content.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.flow_backend.infrastructure.database import Base


class WorkflowORM(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # graph/version are vestigial PR-1 columns kept only so legacy inserts stay
    # valid; the authoring graph now lives in workflow_drafts.content (ADR-0007).
    graph: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships make the unit-of-work flush the parent before its children —
    # bare table FKs only order create_all(), not per-object insert order.
    draft: Mapped["WorkflowDraftORM"] = relationship(
        back_populates="workflow", uselist=False, cascade="all, delete-orphan"
    )
    node_usages: Mapped[list["NodeUsageORM"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


class WorkflowDraftORM(Base):
    __tablename__ = "workflow_drafts"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    content_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    draft_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workflow: Mapped["WorkflowORM"] = relationship(back_populates="draft")


class NodeUsageORM(Base):
    __tablename__ = "node_usages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    type_id: Mapped[str] = mapped_column(Text, nullable=False)
    connection_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    node_path: Mapped[str] = mapped_column(Text, nullable=False)

    workflow: Mapped["WorkflowORM"] = relationship(back_populates="node_usages")
