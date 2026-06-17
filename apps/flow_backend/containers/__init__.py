"""Root DI container for flow-backend (ADR-0019).

Owns shared infrastructure (db, outbox relay). Domain context sub-containers
are added here as bounded contexts are implemented — see containers/*.
"""

from dependency_injector import containers, providers

from apps.flow_backend.config import Settings
from apps.flow_backend.containers.workflows import WorkflowsContainer
from apps.flow_backend.infrastructure.database import Database
from apps.flow_backend.infrastructure.outbox.relay import OutboxRelay


async def _noop_publish(message: object) -> None:
    """Placeholder event bus publish — replaced when a real bus is wired."""


class ApplicationContainer(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(packages=["apps.flow_backend.api"])

    settings = providers.Singleton(Settings)

    db = providers.Singleton(
        Database,
        db_url=providers.Callable(lambda s: str(s.database_url), settings),
    )

    outbox_relay = providers.Singleton(
        OutboxRelay,
        session_factory=db.provided.session,
        publish=_noop_publish,
    )

    workflows = providers.Container(WorkflowsContainer, db=db)
