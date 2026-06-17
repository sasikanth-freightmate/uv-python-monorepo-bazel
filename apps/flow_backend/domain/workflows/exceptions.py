from apps.flow_backend.domain.shared.value_objects import WorkflowId


class WorkflowError(Exception):
    """Base for all workflows domain errors."""


class WorkflowNotFound(WorkflowError):
    def __init__(self, workflow_id: WorkflowId) -> None:
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} not found")


class WorkflowAlreadyPublished(WorkflowError):
    def __init__(self, workflow_id: WorkflowId) -> None:
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} is already published")


class InvalidWorkflowGraph(WorkflowError):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(f"Invalid workflow graph: {reason}")
