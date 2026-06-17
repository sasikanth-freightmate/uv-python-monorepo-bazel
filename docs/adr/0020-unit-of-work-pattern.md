# ADR-0020: Unit of Work Pattern for Transaction Management

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0018 (layer architecture), ADR-0019 (DI), ADR-0021 (transactional outbox)

## Context

Use cases frequently touch more than one repository (e.g., create a shipment and deduct carrier capacity). These writes must be atomic. The naive approach — injecting individual repositories and a shared session into the service — leaks session lifecycle into the application layer and makes it easy to accidentally commit partial state.

Additionally, domain aggregates raise events as part of their state transitions. These events must be collected and dispatched only after the DB transaction commits, never before (see ADR-0021).

## Decision

Implement a **Unit of Work** per bounded context. The UoW owns the SQLAlchemy session, exposes repositories as attributes, tracks which aggregates were touched, and collects + dispatches their events after commit.

**Aggregate event collection:**

```python
# domain/shipments/models.py
class Shipment:
    def __init__(self):
        self._events: list[DomainEvent] = []

    def pop_events(self) -> list[DomainEvent]:
        events, self._events = self._events, []
        return events
```

**Collecting repository (wraps concrete impl):**

```python
# application/shipments/unit_of_work.py
class CollectingRepository:
    def __init__(self, repo, seen: list):
        self._repo = repo
        self._seen = seen

    def add(self, aggregate):
        self._seen.append(aggregate)
        self._repo.add(aggregate)

    def get(self, id):
        agg = self._repo.get(id)
        if agg:
            self._seen.append(agg)
        return agg
```

**Unit of Work:**

```python
class ShipmentUnitOfWork:
    def __init__(self, session_factory, outbox_repo_factory, event_bus):
        self._session_factory = session_factory
        self._outbox_repo_factory = outbox_repo_factory
        self._event_bus = event_bus

    def __enter__(self):
        self._session = self._session_factory()
        self._seen: list = []
        self.shipments = CollectingRepository(
            ShipmentSQLAlchemyRepository(self._session), self._seen
        )
        self.carriers = CollectingRepository(
            CarrierSQLAlchemyRepository(self._session), self._seen
        )
        self._outbox = self._outbox_repo_factory(self._session)
        return self

    def __exit__(self, exc_type, *_):
        if exc_type:
            self._session.rollback()
        else:
            events = [e for agg in self._seen for e in agg.pop_events()]
            for e in events:
                self._outbox.add(e)      # write to outbox in same transaction
            self._session.commit()       # aggregate writes + outbox, atomic
        self._session.close()
```

**Use case:**

```python
class ShipmentService:
    def __init__(self, uow: Callable[[], ShipmentUnitOfWork]):
        self._uow = uow

    def book(self, data: BookShipmentCommand) -> UUID:
        with self._uow() as uow:
            carrier = uow.carriers.get(data.carrier_id)
            carrier.deduct_capacity(data.weight)
            shipment = Shipment.create(data)
            uow.shipments.add(shipment)
            return shipment.id
            # commit + event collection happens in __exit__
```

The container provides UoW as a `Factory` (new instance per call):

```python
uow = providers.Factory(ShipmentUnitOfWork, session_factory=db.provided.session, ...)
service = providers.Factory(ShipmentService, uow=uow)
```

## Consequences

**Positive**

- Multi-repository atomicity is guaranteed by construction — no way to partially commit.
- Domain events are always collected before commit and dispatched after — the safe ordering is enforced structurally, not by convention.
- Services receive a callable UoW factory, not a session — session lifecycle is fully encapsulated.
- `CollectingRepository` can be tested by inspecting `_seen` without a real DB.

**Negative / constraints**

- Each bounded context needs its own UoW class (repositories differ per context). This is intentional — a single global UoW with all repositories would couple all contexts.
- Aggregates must implement `pop_events()`. A missed implementation means events are silently dropped; enforce via a `DomainAggregate` base class or Protocol.

## Alternatives considered

- **Inject individual repositories + shared session into service** — rejected; session lifecycle leaks into application layer, easy to forget rollback on exception.
- **SQLAlchemy scoped_session** — rejected; request-scoped sessions are a web framework concern, not a domain concern, and complicate non-HTTP use (workers, tests).
- **Publish events before commit** — rejected; if commit fails after publish, downstream consumers act on a non-existent state change (ghost events).
