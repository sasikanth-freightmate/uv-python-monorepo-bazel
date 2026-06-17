# ADR-0019: Dependency Injection via Protocols + python-dependency-injector

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0018 (layer architecture), ADR-0020 (unit of work)

## Context

Clean Architecture requires that layer boundaries are defined by abstractions, not concrete types, so implementations can be swapped (especially for testing). Python offers two mechanisms: `ABC` (nominal subtyping — must explicitly inherit) and `typing.Protocol` (structural subtyping — any class with the right shape satisfies the contract). A DI container is needed to wire concrete implementations to those abstractions at startup without scattering construction logic across the codebase.

## Decision

**Abstractions:** Define layer contracts as `typing.Protocol` classes in `domain/<context>/repositories.py`. Concrete implementations in `infrastructure/` satisfy protocols structurally — no explicit `implements` or `(Protocol)` inheritance on the concrete class.

```python
# domain/shipments/repositories.py
from typing import Protocol
from domain.shipments.models import Shipment

class ShipmentRepository(Protocol):
    def add(self, shipment: Shipment) -> None: ...
    def get(self, shipment_id: UUID) -> Shipment | None: ...
```

**DI container:** Use `ets-labs/python-dependency-injector` with `DeclarativeContainer`. One root container composes sub-containers per bounded context. Shared infrastructure (DB, cache, event bus) lives in the root container and is injected into sub-containers via `providers.Dependency()`.

```python
# containers.py (root)
class ApplicationContainer(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(packages=["api"])
    config = providers.Configuration(yaml_files=["config.yml"])
    db = providers.Singleton(Database, db_url=config.db.url)
    event_bus = providers.Singleton(OutboxRelay)
    shipments = providers.Container(ShipmentsContainer, db=db)
    carriers = providers.Container(CarriersContainer, db=db)

# containers/shipments.py
class ShipmentsContainer(containers.DeclarativeContainer):
    db = providers.Dependency()
    uow = providers.Factory(ShipmentUnitOfWork, session_factory=db.provided.session)
    service = providers.Factory(ShipmentService, uow=uow)
```

**Injection in API layer only:**

```python
# api/shipments/endpoints.py
@router.post("/shipments")
@inject
async def create_shipment(
    data: CreateShipmentRequest,
    service: Annotated[ShipmentService, Depends(Provide[Container.shipments.service])],
):
    return service.book(data)
```

**Application factory:**

```python
# application.py
def create_app() -> FastAPI:
    container = ApplicationContainer()
    app = FastAPI()
    app.container = container          # exposed for test overrides
    app.include_router(shipments_router)
    return app
```

## Consequences

**Positive**

- Domain layer has zero imports from the DI framework — Protocols are stdlib.
- `@inject` is confined to `api/`; easy to enforce with a grep or lint rule.
- Provider overriding in tests is clean: `app.container.shipments.service.override(mock)`.
- Structural subtyping means `mock.Mock(spec=ConcreteRepository)` satisfies the Protocol without extra setup.

**Negative / constraints**

- `WiringConfiguration(packages=["api"])` must be updated when new API packages are added.
- `providers.Dependency()` requires passing shared deps explicitly to each sub-container — more wiring ceremony than a global service locator, but intentional.

## Alternatives considered

- **ABC-based abstractions** — rejected; requires concrete classes to explicitly inherit, coupling infrastructure to domain base classes unnecessarily.
- **Manual wiring / factory functions** — rejected; doesn't scale past a handful of dependencies and lacks test override support.
- **FastAPI `Depends()` only (no container)** — rejected; Depends chains become unwieldy for deep dependency graphs and don't support provider overriding cleanly.
