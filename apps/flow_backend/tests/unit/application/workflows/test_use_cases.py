"""Unit tests for workflow application use cases (ADR-0017, ADR-0018).

Uses an in-memory fake UoW — a real implementation of the async context
manager protocol, not a mock (ADR-0018: "UoW replaced with in-memory fake").
No DB, no containers.
"""

import unittest
import uuid

from apps.flow_backend.application.workflows.use_cases import (
    CreateDraft,
    CreateDraftCommand,
    GetWorkflow,
    PublishWorkflow,
    PublishWorkflowCommand,
)
from apps.flow_backend.domain.shared.value_objects import TenantId, WorkflowId
from apps.flow_backend.domain.workflows.exceptions import WorkflowNotFound
from apps.flow_backend.domain.workflows.models import WorkflowDraft, WorkflowStatus


# ── In-memory fake UoW (real implementation, not a mock) ─────────────────────

class _InMemoryWorkflowRepository:
    def __init__(self) -> None:
        self._store: dict[WorkflowId, WorkflowDraft] = {}

    def add(self, workflow: WorkflowDraft) -> None:
        self._store[workflow.id] = workflow

    async def get(self, workflow_id: WorkflowId) -> WorkflowDraft | None:
        return self._store.get(workflow_id)

    async def list_by_tenant(
        self, tenant_id: TenantId, limit: int, offset: int
    ) -> list[WorkflowDraft]:
        return [w for w in self._store.values() if w.tenant_id == tenant_id]


class _InMemoryUoW:
    def __init__(self) -> None:
        self.workflows = _InMemoryWorkflowRepository()

    async def __aenter__(self) -> "_InMemoryUoW":
        return self

    async def __aexit__(self, exc_type, *_) -> None:
        pass


# ── Tests ─────────────────────────────────────────────────────────────────────

class CreateDraftTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = CreateDraft(uow_factory=lambda: self._uow)

    async def test_returns_a_workflow_id(self) -> None:
        cmd = CreateDraftCommand(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        workflow_id = await self._use_case.execute(cmd)
        self.assertIsInstance(workflow_id, uuid.UUID)

    async def test_workflow_is_stored_with_draft_status(self) -> None:
        tid = TenantId(uuid.uuid4())
        cmd = CreateDraftCommand(tenant_id=tid, name="My Flow")
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertIsNotNone(stored)
        self.assertEqual(stored.status, WorkflowStatus.DRAFT)

    async def test_graph_is_stored_when_provided(self) -> None:
        graph = {"nodes": [{"id": "a"}], "edges": []}
        cmd = CreateDraftCommand(
            tenant_id=TenantId(uuid.uuid4()), name="My Flow", graph=graph
        )
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.graph, graph)

    async def test_tenant_id_is_preserved(self) -> None:
        tid = TenantId(uuid.uuid4())
        cmd = CreateDraftCommand(tenant_id=tid, name="My Flow")
        workflow_id = await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.tenant_id, tid)


class PublishWorkflowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = PublishWorkflow(uow_factory=lambda: self._uow)

    def _seed_draft(self) -> WorkflowId:
        draft = WorkflowDraft.create(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        self._uow.workflows.add(draft)
        return draft.id

    async def test_publishes_an_existing_draft(self) -> None:
        workflow_id = self._seed_draft()
        cmd = PublishWorkflowCommand(
            workflow_id=workflow_id, tenant_id=TenantId(uuid.uuid4())
        )
        await self._use_case.execute(cmd)
        stored = await self._uow.workflows.get(workflow_id)
        self.assertEqual(stored.status, WorkflowStatus.PUBLISHED)

    async def test_raises_workflow_not_found_for_unknown_id(self) -> None:
        cmd = PublishWorkflowCommand(
            workflow_id=WorkflowId(uuid.uuid4()),
            tenant_id=TenantId(uuid.uuid4()),
        )
        with self.assertRaises(WorkflowNotFound):
            await self._use_case.execute(cmd)


class GetWorkflowTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._uow = _InMemoryUoW()
        self._use_case = GetWorkflow(uow_factory=lambda: self._uow)

    def _seed_draft(self) -> WorkflowDraft:
        draft = WorkflowDraft.create(tenant_id=TenantId(uuid.uuid4()), name="My Flow")
        self._uow.workflows.add(draft)
        return draft

    async def test_returns_the_workflow(self) -> None:
        draft = self._seed_draft()
        result = await self._use_case.execute(draft.id)
        self.assertEqual(result.id, draft.id)
        self.assertEqual(result.name, draft.name)

    async def test_raises_workflow_not_found_for_unknown_id(self) -> None:
        with self.assertRaises(WorkflowNotFound):
            await self._use_case.execute(WorkflowId(uuid.uuid4()))


if __name__ == "__main__":
    unittest.main()
