"""Workflows bounded context DI sub-container (ADR-0019)."""

from dependency_injector import containers, providers

from apps.flow_backend.application.workflows.unit_of_work import WorkflowUnitOfWork
from apps.flow_backend.application.workflows.use_cases import (
    CreateWorkflow,
    GetWorkflow,
    ListWorkflows,
    SaveDraft,
    UpdateWorkflow,
)


class WorkflowsContainer(containers.DeclarativeContainer):
    db = providers.Dependency()

    uow = providers.Factory(WorkflowUnitOfWork, session_factory=db.provided.session)

    # Inject the provider itself (delegation via `.provider`) so each use case
    # call constructs a fresh UoW — `uow` alone would inject a single instance.
    create_workflow = providers.Factory(CreateWorkflow, uow_factory=uow.provider)
    save_draft = providers.Factory(SaveDraft, uow_factory=uow.provider)
    update_workflow = providers.Factory(UpdateWorkflow, uow_factory=uow.provider)
    list_workflows = providers.Factory(ListWorkflows, uow_factory=uow.provider)
    get_workflow = providers.Factory(GetWorkflow, uow_factory=uow.provider)
