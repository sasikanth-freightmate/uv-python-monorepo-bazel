"""Node-types bounded context DI sub-container (ADR-0019)."""

from dependency_injector import containers, providers

from apps.flow_backend.application.node_types.unit_of_work import NodeTypeUnitOfWork
from apps.flow_backend.application.node_types.use_cases import ListNodeTypes, SeedCatalog


class NodeTypesContainer(containers.DeclarativeContainer):
    db = providers.Dependency()

    uow = providers.Factory(NodeTypeUnitOfWork, session_factory=db.provided.session)

    # `.provider` delegates so each call builds a fresh UoW (see workflows container).
    list_node_types = providers.Factory(ListNodeTypes, uow_factory=uow.provider)
    seed_catalog = providers.Factory(SeedCatalog, uow_factory=uow.provider)
