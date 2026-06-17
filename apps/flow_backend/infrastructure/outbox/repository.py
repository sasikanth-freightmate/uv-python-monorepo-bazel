import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.infrastructure.outbox.models import OutboxMessage


class OutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, event_type: str, payload: dict, event_id: uuid.UUID | None = None) -> None:
        self._session.add(
            OutboxMessage(
                id=event_id or uuid.uuid4(),
                event_type=event_type,
                payload=payload,
                occurred_at=datetime.now(tz=timezone.utc),
            )
        )

    async def get_unpublished(self, limit: int = 100) -> list[OutboxMessage]:
        result = await self._session.execute(
            select(OutboxMessage)
            .where(OutboxMessage.published.is_(False))
            .order_by(OutboxMessage.occurred_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(result.scalars().all())
