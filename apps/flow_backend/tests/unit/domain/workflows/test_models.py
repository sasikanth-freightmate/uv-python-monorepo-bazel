"""Unit tests for the WorkflowDraft aggregate (ADR-0017, ADR-0018).

Pure Python — no DB, no framework, no mocks.
"""

import unittest
import uuid

from apps.flow_backend.domain.shared.value_objects import TenantId
from apps.flow_backend.domain.workflows.events import WorkflowDraftCreated, WorkflowPublished
from apps.flow_backend.domain.workflows.exceptions import WorkflowAlreadyPublished
from apps.flow_backend.domain.workflows.models import WorkflowDraft, WorkflowStatus


def _tenant() -> TenantId:
    return TenantId(uuid.uuid4())


def _draft(**kwargs) -> WorkflowDraft:
    d = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow", **kwargs)
    d.pop_events()
    return d


class WorkflowDraftCreateTest(unittest.TestCase):
    def test_status_is_draft(self) -> None:
        draft = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(draft.status, WorkflowStatus.DRAFT)

    def test_version_starts_at_zero(self) -> None:
        draft = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(draft.version, 0)

    def test_graph_defaults_to_empty(self) -> None:
        draft = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(draft.graph, {})

    def test_graph_stores_provided_value(self) -> None:
        graph = {"nodes": [{"id": "a"}], "edges": []}
        draft = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow", graph=graph)
        self.assertEqual(draft.graph, graph)

    def test_raises_workflow_draft_created_event(self) -> None:
        tenant_id = _tenant()
        draft = WorkflowDraft.create(tenant_id=tenant_id, name="My Flow")
        events = draft.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], WorkflowDraftCreated)
        self.assertEqual(events[0].name, "My Flow")
        self.assertEqual(events[0].tenant_id, tenant_id)

    def test_pop_events_clears_queue(self) -> None:
        draft = WorkflowDraft.create(tenant_id=_tenant(), name="My Flow")
        draft.pop_events()
        self.assertEqual(draft.pop_events(), [])


class WorkflowDraftPublishTest(unittest.TestCase):
    def test_changes_status_to_published(self) -> None:
        draft = _draft()
        draft.publish()
        self.assertEqual(draft.status, WorkflowStatus.PUBLISHED)

    def test_increments_version(self) -> None:
        draft = _draft()
        draft.publish()
        self.assertEqual(draft.version, 1)

    def test_raises_workflow_published_event(self) -> None:
        draft = _draft()
        draft.publish()
        events = draft.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], WorkflowPublished)
        self.assertEqual(events[0].version, 1)

    def test_published_event_carries_correct_workflow_id(self) -> None:
        draft = _draft()
        draft.publish()
        [event] = draft.pop_events()
        self.assertEqual(event.workflow_id, draft.id)

    def test_raises_already_published_on_second_publish(self) -> None:
        draft = _draft()
        draft.publish()
        with self.assertRaises(WorkflowAlreadyPublished):
            draft.publish()

    def test_no_event_emitted_when_already_published_raises(self) -> None:
        draft = _draft()
        draft.publish()
        draft.pop_events()
        with self.assertRaises(WorkflowAlreadyPublished):
            draft.publish()
        self.assertEqual(draft.pop_events(), [])


class WorkflowDraftUpdateGraphTest(unittest.TestCase):
    def test_replaces_graph_content(self) -> None:
        draft = _draft()
        new_graph = {"nodes": [{"id": "n1"}], "edges": [{"id": "e1"}]}
        draft.update_graph(new_graph)
        self.assertEqual(draft.graph, new_graph)

    def test_advances_updated_at(self) -> None:
        draft = _draft()
        before = draft.updated_at
        draft.update_graph({"nodes": [], "edges": []})
        self.assertGreaterEqual(draft.updated_at, before)


if __name__ == "__main__":
    unittest.main()
