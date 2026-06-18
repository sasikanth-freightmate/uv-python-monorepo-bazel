"""Unit of Work for the workflows bounded context (ADR-0020).

Owns the session lifecycle, exposes repositories via CollectingRepository
to track aggregates for event harvesting, and writes collected events to the
outbox before committing — all in one atomic transaction.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.workflows.models import Workflow
from apps.flow_backend.domain.workflows.repositories import WorkflowRepository
from apps.flow_backend.infrastructure.outbox.repository import OutboxRepository
from apps.flow_backend.infrastructure.workflows.repositories import WorkflowSQLAlchemyRepository


class CollectingRepository:
    """Wraps a concrete repository and tracks touched aggregates for event harvesting."""

    def __init__(self, repo: Any, seen: list) -> None:
        self._repo = repo
        self._seen = seen

    def add(self, aggregate: Workflow) -> None:
        self._seen.append(aggregate)
        self._repo.add(aggregate)

    async def get(self, *args: Any, **kwargs: Any) -> Any:
        result = await self._repo.get(*args, **kwargs)
        if result is not None:
            self._seen.append(result)
        return result

    async def save_draft(self, aggregate: Workflow) -> None:
        # The aggregate was already tracked by the preceding get(); its
        # DraftSaved event is harvested at commit.
        await self._repo.save_draft(aggregate)

    async def update_metadata(self, aggregate: Workflow) -> None:
        await self._repo.update_metadata(aggregate)

    async def list_by_tenant(self, *args: Any, **kwargs: Any) -> Any:
        return await self._repo.list_by_tenant(*args, **kwargs)


class WorkflowUnitOfWork:
    def __init__(self, session_factory: Callable[..., Any]) -> None:
        self._session_factory = session_factory

    async def __aenter__(self) -> WorkflowUnitOfWork:
        # Hold the session context manager so __aexit__ can close it — the CM
        # also applies the RLS tenant variable on entry (infrastructure.database).
        self._session_cm = self._session_factory()
        self._session: AsyncSession = await self._session_cm.__aenter__()
        self._seen: list[Workflow] = []
        self.workflows: WorkflowRepository = CollectingRepository(  # type: ignore[assignment]
            WorkflowSQLAlchemyRepository(self._session),
            self._seen,
        )
        self._outbox = OutboxRepository(self._session)
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        try:
            if exc_type:
                await self._session.rollback()
            else:
                events = [e for agg in self._seen for e in agg.pop_events()]
                for event in events:
                    self._outbox.add(
                        event_type=type(event).__name__,
                        payload=event.to_dict(),
                        event_id=event.event_id,
                    )
                await self._session.commit()
        finally:
            await self._session_cm.__aexit__(exc_type, exc, tb)
