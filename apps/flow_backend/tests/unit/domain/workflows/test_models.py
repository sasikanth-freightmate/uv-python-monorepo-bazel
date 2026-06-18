"""Unit tests for the Workflow aggregate (ADR-0017, ADR-0018).

Pure Python — no DB, no framework, no mocks.
"""

import unittest
import uuid

from apps.flow_backend.domain.shared.value_objects import TenantId
from apps.flow_backend.domain.workflows.events import (
    DraftSaved,
    WorkflowArchivedChanged,
    WorkflowCreated,
    WorkflowRenamed,
)
from apps.flow_backend.domain.workflows.exceptions import StaleDraftRevision
from apps.flow_backend.domain.workflows.models import (
    Workflow,
    WorkflowStatus,
    compute_content_hash,
    derive_node_usages,
)


def _tenant() -> TenantId:
    return TenantId(uuid.uuid4())


def _workflow(**kwargs) -> Workflow:
    wf = Workflow.create(tenant_id=_tenant(), name="My Flow", **kwargs)
    wf.pop_events()
    return wf


class WorkflowCreateTest(unittest.TestCase):
    def test_status_is_draft(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(wf.status, WorkflowStatus.DRAFT)

    def test_is_not_archived(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        self.assertFalse(wf.archived)

    def test_draft_revision_starts_at_zero(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(wf.draft.draft_revision, 0)

    def test_content_defaults_to_empty(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(wf.draft.content, {})

    def test_content_stores_provided_value(self) -> None:
        content = {"nodes": [{"id": "a", "type": "delay"}], "edges": []}
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow", content=content)
        self.assertEqual(wf.draft.content, content)

    def test_content_hash_is_set_on_create(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        self.assertEqual(wf.draft.content_hash, compute_content_hash({}))

    def test_raises_workflow_created_event(self) -> None:
        tenant_id = _tenant()
        wf = Workflow.create(tenant_id=tenant_id, name="My Flow")
        events = wf.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], WorkflowCreated)
        self.assertEqual(events[0].name, "My Flow")
        self.assertEqual(events[0].tenant_id, tenant_id)

    def test_pop_events_clears_queue(self) -> None:
        wf = Workflow.create(tenant_id=_tenant(), name="My Flow")
        wf.pop_events()
        self.assertEqual(wf.pop_events(), [])


class WorkflowSaveDraftTest(unittest.TestCase):
    def test_replaces_content(self) -> None:
        wf = _workflow()
        new_content = {"nodes": [{"id": "n1", "type": "delay"}], "edges": []}
        wf.save_draft(new_content, expected_revision=0)
        self.assertEqual(wf.draft.content, new_content)

    def test_increments_revision(self) -> None:
        wf = _workflow()
        wf.save_draft({"nodes": []}, expected_revision=0)
        self.assertEqual(wf.draft.draft_revision, 1)

    def test_recomputes_content_hash(self) -> None:
        wf = _workflow()
        content = {"nodes": [{"id": "n1", "type": "delay"}]}
        wf.save_draft(content, expected_revision=0)
        self.assertEqual(wf.draft.content_hash, compute_content_hash(content))

    def test_records_updater(self) -> None:
        wf = _workflow()
        wf.save_draft({"nodes": []}, expected_revision=0, updated_by="user-7")
        self.assertEqual(wf.draft.updated_by, "user-7")

    def test_advances_updated_at(self) -> None:
        wf = _workflow()
        before = wf.updated_at
        wf.save_draft({"nodes": []}, expected_revision=0)
        self.assertGreaterEqual(wf.updated_at, before)

    def test_emits_draft_saved_event(self) -> None:
        wf = _workflow()
        wf.save_draft({"nodes": []}, expected_revision=0)
        events = wf.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], DraftSaved)
        self.assertEqual(events[0].draft_revision, 1)
        self.assertEqual(events[0].workflow_id, wf.id)

    def test_consecutive_saves_increment_monotonically(self) -> None:
        wf = _workflow()
        wf.save_draft({"nodes": []}, expected_revision=0)
        wf.save_draft({"nodes": [{"id": "a", "type": "delay"}]}, expected_revision=1)
        self.assertEqual(wf.draft.draft_revision, 2)

    def test_stale_revision_raises(self) -> None:
        wf = _workflow()
        with self.assertRaises(StaleDraftRevision):
            wf.save_draft({"nodes": []}, expected_revision=5)

    def test_no_event_emitted_when_stale(self) -> None:
        wf = _workflow()
        with self.assertRaises(StaleDraftRevision):
            wf.save_draft({"nodes": []}, expected_revision=5)
        self.assertEqual(wf.pop_events(), [])

    def test_stale_revision_does_not_mutate_content(self) -> None:
        wf = _workflow(content={"nodes": [{"id": "keep", "type": "delay"}]})
        with self.assertRaises(StaleDraftRevision):
            wf.save_draft({"nodes": []}, expected_revision=99)
        self.assertEqual(wf.draft.content, {"nodes": [{"id": "keep", "type": "delay"}]})


class WorkflowMetadataTest(unittest.TestCase):
    def test_rename_changes_name_and_emits_event(self) -> None:
        wf = _workflow()
        wf.rename("Renamed Flow")
        self.assertEqual(wf.name, "Renamed Flow")
        events = wf.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], WorkflowRenamed)
        self.assertEqual(events[0].name, "Renamed Flow")

    def test_rename_to_same_name_is_a_noop(self) -> None:
        wf = _workflow()
        wf.rename(wf.name)
        self.assertEqual(wf.pop_events(), [])

    def test_archive_sets_flag_and_emits_event(self) -> None:
        wf = _workflow()
        wf.set_archived(True)
        self.assertTrue(wf.archived)
        events = wf.pop_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], WorkflowArchivedChanged)
        self.assertTrue(events[0].archived)

    def test_set_archived_to_current_value_is_a_noop(self) -> None:
        wf = _workflow()
        wf.set_archived(False)  # already not archived
        self.assertEqual(wf.pop_events(), [])

    def test_unarchive_restores(self) -> None:
        wf = _workflow()
        wf.set_archived(True)
        wf.pop_events()
        wf.set_archived(False)
        self.assertFalse(wf.archived)
        [event] = wf.pop_events()
        self.assertFalse(event.archived)


class ContentHashTest(unittest.TestCase):
    def test_is_deterministic_regardless_of_key_order(self) -> None:
        a = {"nodes": [{"id": "n1", "type": "delay"}], "edges": []}
        b = {"edges": [], "nodes": [{"type": "delay", "id": "n1"}]}
        self.assertEqual(compute_content_hash(a), compute_content_hash(b))

    def test_ignores_layout_coordinates(self) -> None:
        without = {"nodes": [{"id": "n1", "type": "delay"}]}
        with_layout = {"nodes": [{"id": "n1", "type": "delay", "x": 40, "y": 90}]}
        self.assertEqual(compute_content_hash(without), compute_content_hash(with_layout))

    def test_differs_on_semantic_change(self) -> None:
        a = {"nodes": [{"id": "n1", "type": "delay"}]}
        b = {"nodes": [{"id": "n1", "type": "email"}]}
        self.assertNotEqual(compute_content_hash(a), compute_content_hash(b))


class DeriveNodeUsagesTest(unittest.TestCase):
    def test_projects_each_node(self) -> None:
        content = {
            "nodes": [
                {"id": "n_trigger", "type": "trigger"},
                {"id": "n_email", "type": "email"},
            ]
        }
        usages = derive_node_usages(content)
        self.assertEqual(
            {(u.node_path, u.type_id) for u in usages},
            {("n_trigger", "trigger"), ("n_email", "email")},
        )

    def test_empty_content_yields_no_usages(self) -> None:
        self.assertEqual(derive_node_usages({}), [])

    def test_skips_nodes_missing_type_or_id(self) -> None:
        content = {"nodes": [{"id": "n1"}, {"type": "delay"}, "not-a-dict", {"id": "n2", "type": "delay"}]}
        usages = derive_node_usages(content)
        self.assertEqual([u.node_path for u in usages], ["n2"])

    def test_extracts_top_level_connection_id(self) -> None:
        cid = uuid.uuid4()
        content = {"nodes": [{"id": "n1", "type": "notify", "connection_id": str(cid)}]}
        [usage] = derive_node_usages(content)
        self.assertEqual(usage.connection_id, cid)

    def test_extracts_connection_id_from_config(self) -> None:
        cid = uuid.uuid4()
        content = {"nodes": [{"id": "n1", "type": "notify", "config": {"connection_id": str(cid)}}]}
        [usage] = derive_node_usages(content)
        self.assertEqual(usage.connection_id, cid)

    def test_connection_id_is_none_when_absent_or_invalid(self) -> None:
        content = {"nodes": [{"id": "n1", "type": "delay"}, {"id": "n2", "type": "notify", "connection_id": "nope"}]}
        usages = derive_node_usages(content)
        self.assertTrue(all(u.connection_id is None for u in usages))


if __name__ == "__main__":
    unittest.main()
