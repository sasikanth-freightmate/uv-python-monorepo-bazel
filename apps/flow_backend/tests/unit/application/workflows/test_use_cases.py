"""Unit tests for workflow application use cases (ADR-0017, ADR-0018).

Uses an in-memory fake UoW — a real implementation of the async context
manager protocol, not a mock (ADR-0018: "UoW replaced with in-memory fake").
No DB, no containers.
"""

import unittest
import uuid

from apps.flow_backend.application.workflows.use_cases import (
    CreateWorkflow,
    CreateWorkflowCommand,
    GetWorkflow,
    ListWorkflows,
    ListWorkflowsQuery,
    SaveDraft,
    SaveDraftCommand,
    UpdateWorkflow,
    UpdateWorkflowCommand,
)
from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.exceptions import StaleDraftRevision, WorkflowNotFound
from apps.flow_backend.domain.workflows.models import Workflow, WorkflowStatus


# ── In-memory fake UoW (real implementation, not a mock) ─────────────────────

class _InMemoryWorkflowRepository:
    def __init__(self) -> None:
        self._store: dict[WorkflowId, Workflow] = {}

    def add(self, workflow: Workflow) -> None:
        self._store[workflow.id] = workflow

    async def get(self, workflow_id: WorkflowId) -> Workflow | None:
        return self._store.get(workflow_id)

    async def save_draft(self, workflow: Workflow) -> None:
        # The aggregate enforces optimistic concurrency before we get here; the
        # store already holds this same reference, so persistence is a no-op.
        self._store[workflow.id] = workflow

    async def update_metadata(self, workflow: Workflow) -> None:
        self._store[workflow.id] = workflow

    async def list_by_tenant(self, tenant_id: TenantId, limit: int, offset: int) -> list[Workflow]:
        return [w for w in self._store.values() if w.tenant_id == tenant_id]


class _InMemoryUoW:
    def __init__(self) -> None:
        self.workflows = _InMemoryWorkflowRepository()

    async def __aenter__(self) -> "_InMemoryUoW":
        return self

    async def __aexit__(self, exc_type, *_) -> None:
        pass


# ── Tests ─────────────────────────────────────────────────────────────────────

class CreateWorkflowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = CreateWorkflow(uow_factory=lambda: self._uow)

    async def test_returns_a_workflow_id(self) -> None:
        cmd = CreateWorkflowCommand(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        workflow_id = await self._use_case.execute(cmd)
        self.assertIsInstance(workflow_id, uuid.UUID)

    async def test_workflow_is_stored_with_draft_status(self) -> None:
        cmd = CreateWorkflowCommand(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertIsNotNone(stored)
        self.assertEqual(stored.status, WorkflowStatus.DRAFT)
        self.assertEqual(stored.draft.draft_revision, 0)

    async def test_content_is_stored_when_provided(self) -> None:
        content = {"nodes": [{"id": "a", "type": "delay"}], "edges": []}
        cmd = CreateWorkflowCommand(tenant_id=TenantId(uuid.uuid4()), name="My Flow", content=content)
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.draft.content, content)

    async def test_tenant_and_creator_are_preserved(self) -> None:
        tid = TenantId(uuid.uuid4())
        cmd = CreateWorkflowCommand(tenant_id=tid, name="My Flow", created_by="user-1")
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.tenant_id, tid)
        self.assertEqual(stored.draft.updated_by, "user-1")


class SaveDraftTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = SaveDraft(uow_factory=lambda: self._uow)

    def _seed(self) -> WorkflowId:
        wf = Workflow.create(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        self._uow.workflows.add(wf)
        return wf.id

    async def test_saves_content_and_returns_new_revision(self) -> None:
        workflow_id = self._seed()
        content = {"nodes": [{"id": "n1", "type": "delay"}]}
        new_revision = await self._use_case.execute(
            SaveDraftCommand(workflow_id=workflow_id, content=content, expected_revision=0)
        )
        self.assertEqual(new_revision, 1)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.draft.content, content)

    async def test_unknown_workflow_raises_not_found(self) -> None:
        cmd = SaveDraftCommand(
            workflow_id=WorkflowId(uuid.uuid4()), content={"nodes": []}, expected_revision=0
        )
        with self.assertRaises(WorkflowNotFound):
            await self._use_case.execute(cmd)

    async def test_stale_revision_raises_conflict(self) -> None:
        workflow_id = self._seed()
        cmd = SaveDraftCommand(workflow_id=workflow_id, content={"nodes": []}, expected_revision=7)
        with self.assertRaises(StaleDraftRevision):
            await self._use_case.execute(cmd)

    async def test_second_save_needs_updated_revision(self) -> None:
        workflow_id = self._seed()
        await self._use_case.execute(
            SaveDraftCommand(workflow_id=workflow_id, content={"nodes": []}, expected_revision=0)
        )
        # Re-using revision 0 now conflicts; revision is at 1.
        with self.assertRaises(StaleDraftRevision):
            await self._use_case.execute(
                SaveDraftCommand(workflow_id=workflow_id, content={"nodes": []}, expected_revision=0)
            )


class UpdateWorkflowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = UpdateWorkflow(uow_factory=lambda: self._uow)

    def _seed(self) -> WorkflowId:
        wf = Workflow.create(tenant_id=TenantId(uuid.uuid4()), name="Original")
        self._uow.workflows.add(wf)
        return wf.id

    async def test_renames(self) -> None:
        workflow_id = self._seed()
        updated = await self._use_case.execute(
            UpdateWorkflowCommand(workflow_id=workflow_id, name="Renamed")
        )
        self.assertEqual(updated.name, "Renamed")

    async def test_archives(self) -> None:
        workflow_id = self._seed()
        updated = await self._use_case.execute(
            UpdateWorkflowCommand(workflow_id=workflow_id, archived=True)
        )
        self.assertTrue(updated.archived)

    async def test_partial_update_leaves_other_fields(self) -> None:
        workflow_id = self._seed()
        await self._use_case.execute(UpdateWorkflowCommand(workflow_id=workflow_id, archived=True))
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.name, "Original")  # unchanged
        self.assertTrue(stored.archived)

    async def test_unknown_workflow_raises_not_found(self) -> None:
        with self.assertRaises(WorkflowNotFound):
            await self._use_case.execute(UpdateWorkflowCommand(workflow_id=WorkflowId(uuid.uuid4()), name="X"))


class ListWorkflowsTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = ListWorkflows(uow_factory=lambda: self._uow)
        self._tenant = TenantId(uuid.uuid4())

    def _seed(self, name: str, archived: bool = False, tenant: TenantId | None = None) -> None:
        wf = Workflow.create(tenant_id=tenant or self._tenant, name=name)
        if archived:
            wf.set_archived(True)
        self._uow.workflows.add(wf)

    async def test_lists_tenant_workflows(self) -> None:
        self._seed("A")
        self._seed("B")
        result = await self._use_case.execute(ListWorkflowsQuery(tenant_id=self._tenant))
        self.assertEqual({w.name for w in result}, {"A", "B"})

    async def test_excludes_archived_by_default(self) -> None:
        self._seed("Active")
        self._seed("Gone", archived=True)
        result = await self._use_case.execute(ListWorkflowsQuery(tenant_id=self._tenant))
        self.assertEqual([w.name for w in result], ["Active"])

    async def test_include_archived_returns_all(self) -> None:
        self._seed("Active")
        self._seed("Gone", archived=True)
        result = await self._use_case.execute(
            ListWorkflowsQuery(tenant_id=self._tenant, include_archived=True)
        )
        self.assertEqual({w.name for w in result}, {"Active", "Gone"})

    async def test_scoped_to_tenant(self) -> None:
        self._seed("Mine")
        self._seed("Theirs", tenant=TenantId(uuid.uuid4()))
        result = await self._use_case.execute(ListWorkflowsQuery(tenant_id=self._tenant))
        self.assertEqual([w.name for w in result], ["Mine"])


class GetWorkflowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = GetWorkflow(uow_factory=lambda: self._uow)

    def _seed(self) -> Workflow:
        wf = Workflow.create(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        self._uow.workflows.add(wf)
        return wf

    async def test_returns_the_workflow(self) -> None:
        wf = self._seed()
        result = await self._use_case.execute(wf.id)
        self.assertEqual(result.id, wf.id)
        self.assertEqual(result.name, wf.name)

    async def test_raises_workflow_not_found_for_unknown_id(self) -> None:
        with self.assertRaises(WorkflowNotFound):
            await self._use_case.execute(WorkflowId(uuid.uuid4()))


if __name__ == "__main__":
    unittest.main()
