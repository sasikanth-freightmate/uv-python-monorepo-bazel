# ADR-0021: Transactional Outbox for Reliable Domain Event Delivery

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0020 (unit of work), ADR-0013 (reliability and idempotency)

## Context

Domain events raised by aggregates must be delivered to downstream consumers reliably. Publishing directly to a message bus after DB commit creates a gap: if the process dies between commit and publish, the event is lost. Publishing before commit risks delivering events for writes that never persisted (ghost events). Reliable delivery requires at-least-once semantics with a durable staging area.

## Decision

Use the **transactional outbox pattern**: domain events are written to an `outbox` table in the same DB transaction as the aggregate changes. A separate relay process reads unpublished outbox rows and publishes them to the event bus, marking each row published after successful delivery.

**Outbox table:**

```sql
CREATE TABLE outbox_messages (
    id          UUID PRIMARY KEY,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    published   BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished ON outbox_messages (occurred_at) WHERE NOT published;
```

**Outbox repository (infrastructure layer):**

```python
class OutboxRepository:
    def __init__(self, session: Session):
        self._session = session

    def add(self, event: DomainEvent) -> None:
        self._session.add(OutboxMessage(
            id=event.event_id,
            event_type=type(event).__name__,
            payload=event.to_dict(),
            occurred_at=event.occurred_at,
        ))

    def get_unpublished(self, limit: int = 100) -> list[OutboxMessage]:
        return (
            self._session.query(OutboxMessage)
            .filter_by(published=False)
            .order_by(OutboxMessage.occurred_at)
            .limit(limit)
            .with_for_update(skip_locked=True)   # safe for multiple relay instances
            .all()
        )
```

**Relay process:**

```python
class OutboxRelay:
    def __init__(self, session_factory, event_bus, poll_interval: float = 1.0):
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._poll_interval = poll_interval

    async def run(self) -> None:
        while True:
            await self._process_batch()
            await asyncio.sleep(self._poll_interval)

    async def _process_batch(self) -> None:
        with self._session_factory() as session:
            repo = OutboxRepository(session)
            for msg in repo.get_unpublished(limit=100):
                await self._event_bus.publish(msg)
                msg.published = True
                msg.published_at = datetime.utcnow()
                session.commit()          # one commit per message — crash-safe
```

**Event envelope published to bus:**

```json
{
  "event_id": "uuid",
  "event_type": "ShipmentCreated",
  "occurred_at": "2026-06-17T...",
  "payload": { ... }
}
```

**Integration with Unit of Work (ADR-0020):** The UoW writes events to the outbox repository inside `__exit__` before committing. The relay is wired as a singleton in the root container and started alongside the FastAPI app.

**Consumer requirements:** Consumers must deduplicate on `event_id` (at-least-once delivery). The relay may publish the same message twice if it crashes between publish and `session.commit()`.

**Outbox retention:** A scheduled job prunes rows where `published = TRUE AND published_at < NOW() - INTERVAL '7 days'`.

## Consequences

**Positive**

- Aggregate write and event staging are atomic — no ghost events, no silent loss.
- Relay crash-safety: `WITH FOR UPDATE SKIP LOCKED` allows multiple relay instances without double-publishing within a batch; per-message commit minimises re-delivery on crash.
- The domain and application layers never reference the event bus — it is entirely an infrastructure concern.
- Works with any event bus (RabbitMQ, Kafka, Redis Streams) by swapping the relay's `event_bus` implementation.

**Negative / constraints**

- Additional `outbox_messages` table and relay process to operate.
- Delivery latency is bounded by relay poll interval (default 1 s). Reduce poll interval or use Postgres `LISTEN/NOTIFY` to trigger the relay for lower latency.
- Consumers must implement idempotency on `event_id` — this is a non-negotiable contract.
- Does not guarantee ordering across aggregates; ordering within a single aggregate is preserved by `occurred_at`.

## Alternatives considered

- **Publish to bus directly in UoW `__exit__` after commit** — rejected; process crash between commit and publish silently drops events.
- **Publish before commit** — rejected; ghost events on commit failure.
- **Change Data Capture (Debezium)** — viable alternative that eliminates the relay process; rejected for now due to additional infrastructure (Kafka Connect, schema registry). Revisit if poll latency becomes unacceptable.
- **Temporal activities for event publishing** — viable given Temporal is in the stack; rejected to keep domain event delivery decoupled from workflow execution infrastructure.
