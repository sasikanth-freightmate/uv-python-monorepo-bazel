"""Pydantic response schemas for the node-types API (ADR-0018).

Adapter-layer types only — never imported from domain/.
"""

from __future__ import annotations

from pydantic import BaseModel

from apps.flow_backend.domain.node_types.models import NodeTypeManifest


class NodeTypeResponse(BaseModel):
    type_id: str
    category: str
    display: dict
    config_schema: dict
    output_spec: dict  # static {path,type}[] or from_config rule (ADR-0014)
    storage_lane: str
    retry_safe: bool

    @classmethod
    def from_manifest(cls, m: NodeTypeManifest) -> NodeTypeResponse:
        return cls(
            type_id=m.type_id,
            category=m.category,
            display=m.display,
            config_schema=m.config_schema,
            output_spec=m.output_spec.to_dict(),
            storage_lane=m.storage_lane.value,
            retry_safe=m.retry_safe,
        )
