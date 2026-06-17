"""Workflows bounded context DI sub-container (ADR-0019)."""

from dependency_injector import containers, providers

from apps.flow_backend.application.workflows.unit_of_work import WorkflowUnitOfWork
from apps.flow_backend.application.workflows.use_cases import CreateDraft, GetWorkflow, PublishWorkflow


class WorkflowsContainer(containers.DeclarativeContainer):
    db = providers.Dependency()

    uow = providers.Factory(WorkflowUnitOfWork, session_factory=db.provided.session)

    create_draft = providers.Factory(CreateDraft, uow_factory=uow)
    publish_workflow = providers.Factory(PublishWorkflow, uow_factory=uow)
    get_workflow = providers.Factory(GetWorkflow, uow_factory=uow)
