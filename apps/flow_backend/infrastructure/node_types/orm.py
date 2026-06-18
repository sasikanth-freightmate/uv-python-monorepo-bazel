"""SQLAlchemy ORM for the node-types registry (ADR-0018).

Maps the GLOBAL ``node_type_manifests`` table (no ``org_id``, no RLS — see the
data model). Domain ↔ ORM translation happens in the repository.
"""

from sqlalchemy import Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from apps.flow_backend.infrastructure.database import Base


class NodeTypeManifestORM(Base):
    __tablename__ = "node_type_manifests"

    type_id: Mapped[str] = mapped_column(Text, primary_key=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    display: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    config_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_spec: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    storage_lane: Mapped[str] = mapped_column(Text, nullable=False)
    retry_safe: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
