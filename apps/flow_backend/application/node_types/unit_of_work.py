"""Unit of Work for the node-types context (ADR-0020).

Lighter than the workflows UoW: the catalog is global config data that raises no
domain events, so there is no outbox/event-harvesting step — just session
lifecycle and the repository, committed atomically.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.node_types.repositories import NodeTypeRepository
from apps.flow_backend.infrastructure.node_types.repositories import NodeTypeSQLAlchemyRepository


class NodeTypeUnitOfWork:
    def __init__(self, session_factory: Callable[..., Any]) -> None:
        self._session_factory = session_factory

    async def __aenter__(self) -> NodeTypeUnitOfWork:
        self._session_cm = self._session_factory()
        self._session: AsyncSession = await self._session_cm.__aenter__()
        self.node_types: NodeTypeRepository = NodeTypeSQLAlchemyRepository(self._session)
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        try:
            if exc_type:
                await self._session.rollback()
            else:
                await self._session.commit()
        finally:
            await self._session_cm.__aexit__(exc_type, exc, tb)
