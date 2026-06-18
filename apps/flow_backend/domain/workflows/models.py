"""Workflows aggregate — pure Python, no framework imports (ADR-0018).

``Workflow`` is the aggregate root (the ``workflows`` row); it owns its single
mutable ``WorkflowDraft`` (the ``workflow_drafts`` row, ADR-0007). All authoring
edits go through :meth:`Workflow.save_draft`, which is guarded by an
optimistic-concurrency token (``draft_revision``): a stale autosave is rejected
(``StaleDraftRevision`` → 409) rather than silently clobbering a newer edit.

``content`` is the unsealed graph JSONB. ``node_usages`` is a *derived* index
over it (data-model #35): node-type and connection references projected out of
the graph and rebuilt on every save. The derivation lives here (pure) so it is
unit-testable without a database; the repository only persists the result.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId, new_workflow_id
from apps.flow_backend.domain.workflows.events import (
    DomainEvent,
    DraftSaved,
    WorkflowArchivedChanged,
    WorkflowCreated,
    WorkflowRenamed,
)
from apps.flow_backend.domain.workflows.exceptions import StaleDraftRevision


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


# Layout-only keys excluded from the *semantic* content hash so that moving a
# node on the canvas doesn't mark the draft dirty (ADR-0007 dirty-check).
_LAYOUT_KEYS = frozenset({"x", "y", "position", "selected", "dragging", "width", "height"})


def _strip_layout(value: object) -> object:
    if isinstance(value, dict):
        return {k: _strip_layout(v) for k, v in value.items() if k not in _LAYOUT_KEYS}
    if isinstance(value, list):
        return [_strip_layout(v) for v in value]
    return value


def compute_content_hash(content: dict) -> str:
    """Stable semantic hash of a graph, ignoring layout (ADR-0007)."""
    canonical = json.dumps(_strip_layout(content), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class NodeUsage:
    """A derived index row over draft/version content (data-model ``node_usages``)."""

    type_id: str
    node_path: str
    connection_id: uuid.UUID | None = None


def _node_connection_id(node: dict) -> uuid.UUID | None:
    raw = node.get("connection_id")
    if raw is None:
        config = node.get("config")
        if isinstance(config, dict):
            raw = config.get("connection_id")
    if raw is None:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return None


def derive_node_usages(content: dict) -> list[NodeUsage]:
    """Project a graph's nodes into node-type / connection usages.

    Rebuilt from ``content`` on every save — the hybrid derived index the data
    model calls for. Defensive about node shape: a node needs both a ``type``
    (the ``type_id``, ADR-0009) and an ``id`` (its ``node_path``) to count.
    """
    usages: list[NodeUsage] = []
    for node in content.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        type_id = node.get("type")
        node_path = node.get("id")
        if not type_id or not node_path:
            continue
        usages.append(
            NodeUsage(
                type_id=str(type_id),
                node_path=str(node_path),
                connection_id=_node_connection_id(node),
            )
        )
    return usages


@dataclass
class WorkflowDraft:
    """The single mutable draft graph for a workflow (``workflow_drafts``)."""

    content: dict
    content_hash: str
    draft_revision: int
    base_version_id: uuid.UUID | None = None
    updated_by: str | None = None
    updated_at: datetime | None = None

    def node_usages(self) -> list[NodeUsage]:
        return derive_node_usages(self.content)


@dataclass
class Workflow:
    """Aggregate root: a workflow and its single mutable draft (ADR-0007)."""

    id: WorkflowId
    tenant_id: TenantId
    name: str
    status: WorkflowStatus
    archived: bool
    draft: WorkflowDraft
    created_at: datetime
    updated_at: datetime
    _events: list[DomainEvent] = field(default_factory=list, repr=False, compare=False)

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        tenant_id: TenantId,
        name: str,
        content: dict | None = None,
        updated_by: str | None = None,
    ) -> Workflow:
        now = datetime.now(tz=timezone.utc)
        workflow_id = new_workflow_id()
        content = content or {}
        draft = WorkflowDraft(
            content=content,
            content_hash=compute_content_hash(content),
            draft_revision=0,
            base_version_id=None,
            updated_by=updated_by,
            updated_at=now,
        )
        workflow = cls(
            id=workflow_id,
            tenant_id=tenant_id,
            name=name,
            status=WorkflowStatus.DRAFT,
            archived=False,
            draft=draft,
            created_at=now,
            updated_at=now,
        )
        workflow._events.append(
            WorkflowCreated(workflow_id=workflow_id, tenant_id=tenant_id, name=name)
        )
        return workflow

    # ── Commands ──────────────────────────────────────────────────────────────

    def save_draft(self, content: dict, expected_revision: int, updated_by: str | None = None) -> None:
        """Replace the draft graph under optimistic concurrency (ADR-0007).

        ``expected_revision`` is the revision the editor last saw. If it no
        longer matches, a newer save landed first and this one is rejected.
        """
        if expected_revision != self.draft.draft_revision:
            raise StaleDraftRevision(
                self.id, expected=expected_revision, actual=self.draft.draft_revision
            )
        now = datetime.now(tz=timezone.utc)
        self.draft.content = content
        self.draft.content_hash = compute_content_hash(content)
        self.draft.draft_revision += 1
        self.draft.updated_by = updated_by
        self.draft.updated_at = now
        self.updated_at = now
        self._events.append(
            DraftSaved(
                workflow_id=self.id,
                tenant_id=self.tenant_id,
                draft_revision=self.draft.draft_revision,
            )
        )

    def rename(self, name: str) -> None:
        if name == self.name:
            return
        self.name = name
        self.updated_at = datetime.now(tz=timezone.utc)
        self._events.append(WorkflowRenamed(workflow_id=self.id, tenant_id=self.tenant_id, name=name))

    def set_archived(self, archived: bool) -> None:
        if archived == self.archived:
            return
        self.archived = archived
        self.updated_at = datetime.now(tz=timezone.utc)
        self._events.append(
            WorkflowArchivedChanged(workflow_id=self.id, tenant_id=self.tenant_id, archived=archived)
        )

    # ── Event collection ──────────────────────────────────────────────────────

    def pop_events(self) -> list[DomainEvent]:
        events, self._events = self._events, []
        return events
