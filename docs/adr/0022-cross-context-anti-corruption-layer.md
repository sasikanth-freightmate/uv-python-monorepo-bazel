# ADR-0022: Cross-Context Communication via Anti-Corruption Layer (Sync)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0018 (layer architecture), ADR-0019 (dependency injection)

## Context

Services contain multiple bounded contexts sharing a process and database. When one context needs data from another to make a decision, a communication mechanism is required. Async event-based communication introduces eventual consistency, which complicates reasoning about correctness and requires compensating logic for failures. Synchronous reads are simpler to reason about and sufficient for the use cases in this platform.

The naive synchronous approach — importing one context's domain models directly into another — couples the models and makes independent evolution impossible.

## Decision

Cross-context reads are always synchronous and always go through an **Anti-Corruption Layer (ACL)**. Async event-driven cross-context communication is not used.

**Rules:**

- `domain/<context_a>/` never imports from `domain/<context_b>/`
- The consuming context defines a `Protocol` in its own `domain/<context>/repositories.py` expressing what it needs, in its own vocabulary
- The implementation lives in `infrastructure/<consuming_context>/acl.py` and translates between models
- The ACL adapter is wired via the consuming context's DI sub-container

**Protocol in the consuming domain:**

```python
# domain/shipments/repositories.py
class CarrierCapacityView(Protocol):
    def get_available(self, carrier_id: UUID) -> Decimal: ...

@dataclass(frozen=True)
class CarrierCapacity:
    carrier_id: UUID
    available_weight: Decimal
```

The `CarrierCapacity` dataclass is the shipment context's own model of carrier data — not imported from `domain/carriers/`.

**ACL adapter in infrastructure:**

```python
# infrastructure/shipments/acl.py
class CarrierCapacityAdapter:
    def __init__(self, session: Session):
        self._session = session

    def get_available(self, carrier_id: UUID) -> Decimal:
        row = self._session.execute(
            select(CarrierORM.available_weight)
            .where(CarrierORM.id == carrier_id)
        ).scalar_one_or_none()
        if row is None:
            raise CarrierNotFound(carrier_id)
        return row
```

The adapter may query the other context's ORM models or tables directly. It must not call the other context's domain services or application use cases.

**Wiring in the sub-container:**

```python
# containers/shipments.py
class ShipmentsContainer(containers.DeclarativeContainer):
    db = providers.Dependency()
    carrier_capacity = providers.Factory(
        CarrierCapacityAdapter, session=db.provided.session
    )
    uow = providers.Factory(
        ShipmentUnitOfWork,
        session_factory=db.provided.session,
        carrier_capacity=carrier_capacity,
    )
    service = providers.Factory(ShipmentService, uow=uow)
```

**Use in application layer:**

```python
# application/shipments/unit_of_work.py
class ShipmentUnitOfWork:
    def __init__(self, session_factory, carrier_capacity: CarrierCapacityView):
        self._carrier_capacity = carrier_capacity
        ...

    def __enter__(self):
        ...
        self.carrier_capacity = self._carrier_capacity
        return self
```

```python
# application/shipments/use_cases.py
class BookShipment:
    def execute(self, cmd: BookShipmentCommand) -> UUID:
        with self._uow() as uow:
            available = uow.carrier_capacity.get_available(cmd.carrier_id)
            if available < cmd.weight:
                raise InsufficientCapacity(cmd.carrier_id)
            shipment = Shipment.create(cmd)
            uow.shipments.add(shipment)
            return shipment.id
```

**Future service split:** if the two contexts are ever extracted into separate services, only `infrastructure/shipments/acl.py` changes — the adapter queries an HTTP API instead of the DB. The domain Protocol and all application logic remain identical.

```python
# infrastructure/shipments/acl.py  (after split)
class CarrierCapacityAdapter:
    def __init__(self, http_client: CarrierServiceClient):
        self._client = http_client

    def get_available(self, carrier_id: UUID) -> Decimal:
        return self._client.get_capacity(carrier_id).available_weight
```

## Consequences

**Positive**

- Domain models evolve independently — a change to the carrier model touches only `infrastructure/shipments/acl.py`.
- Synchronous reads are straightforward to reason about: no eventual consistency, no compensating logic.
- The ACL Protocol is testable with a simple `mock.Mock(spec=CarrierCapacityView)` — no DB required.
- Future service extraction is scoped to swapping one adapter implementation.

**Negative / constraints**

- Consuming context must define its own vocabulary for shared concepts — this is intentional duplication, not a mistake.
- ACL adapters may query across context table boundaries. This is acceptable within the same service; document the dependency so schema changes in the source context are flagged during review.
- No async cross-context communication means all cross-context reads are on the critical path. Design ACL queries to be lightweight (indexed lookups, never aggregations).

## Alternatives considered

- **Direct domain model import across contexts** — rejected; couples model evolution, forces coordinated changes.
- **Shared domain model / shared kernel** — acceptable only for true value objects (e.g. `TenantId`, `Money`) that both contexts genuinely own together. Not a general-purpose cross-context mechanism.
- **Async domain events** — rejected as the primary cross-context mechanism; eventual consistency adds complexity without sufficient benefit for the current use cases.
