from apps.flow_backend.domain.shared.value_objects import WorkflowId


class WorkflowError(Exception):
    """Base for all workflows domain errors."""


class WorkflowNotFound(WorkflowError):
    def __init__(self, workflow_id: WorkflowId) -> None:
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} not found")


class StaleDraftRevision(WorkflowError):
    """Autosave lost an optimistic-concurrency race (ADR-0007) → HTTP 409.

    The caller's ``expected`` revision no longer matches the persisted draft,
    meaning a newer save landed first; the stale write is rejected.
    """

    def __init__(self, workflow_id: WorkflowId, expected: int, actual: int) -> None:
        self.workflow_id = workflow_id
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"Stale draft revision for {workflow_id}: expected {expected}, current {actual}"
        )
