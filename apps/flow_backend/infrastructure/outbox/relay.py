"""Outbox relay — polls unpublished messages and dispatches to the event bus.

Runs as a background task alongside the API process. Guarantees at-least-once
delivery: each message is committed as published individually so a crash between
publish and commit only causes a single re-delivery, not a full batch replay.
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.infrastructure.outbox.models import OutboxMessage
from apps.flow_backend.infrastructure.outbox.repository import OutboxRepository

logger = logging.getLogger(__name__)


class OutboxRelay:
    def __init__(
        self,
        session_factory: Callable[..., Any],
        publish: Callable[[OutboxMessage], Any],
        poll_interval: float = 1.0,
    ) -> None:
        self._session_factory = session_factory
        self._publish = publish
        self._poll_interval = poll_interval
        self._running = False

    async def run(self) -> None:
        self._running = True
        logger.info("outbox_relay_started")
        while self._running:
            try:
                await self._process_batch()
            except Exception:
                logger.exception("outbox_relay_batch_error")
            await asyncio.sleep(self._poll_interval)

    async def stop(self) -> None:
        self._running = False

    async def _process_batch(self) -> None:
        async with self._session_factory() as session:
            repo = OutboxRepository(session)
            messages = await repo.get_unpublished(limit=100)
            for msg in messages:
                await self._publish(msg)
                msg.published = True
                msg.published_at = datetime.now(tz=timezone.utc)
                await session.commit()
                logger.debug("outbox_message_published", extra={"event_type": msg.event_type, "id": str(msg.id)})
