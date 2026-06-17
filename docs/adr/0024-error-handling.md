# ADR-0024: Error Handling — Domain Exceptions, Infrastructure Failures, and HTTP Mapping

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0018 (layer architecture), ADR-0022 (cross-context ACL)

## Context

Errors in a layered service fall into three categories with distinct semantics:

- **Validation errors** — malformed requests that never reach the domain (Pydantic, FastAPI)
- **Domain errors** — business rule violations raised by aggregates and use cases
- **Infrastructure errors** — dependency failures (DB timeout, cache unavailable, ACL adapter failure)

Each category has a different HTTP status, logging requirement, and client contract. Without explicit conventions, teams mix these — domain exceptions carry HTTP status codes, infrastructure errors leak stack traces to clients, and 500/503 become indistinguishable.

## Decision

### Validation errors — FastAPI default 422

Pydantic request schema validation is handled by FastAPI's built-in behaviour. No custom handler. Malformed requests return `422 Unprocessable Entity` with FastAPI's default error body before reaching any use case.

### Domain errors — per-context hierarchy, mapped in `api/`

Each bounded context defines a base exception and specific subtypes in `domain/<context>/exceptions.py`. Exceptions carry structured data, never HTTP concepts:

```python
# domain/shipments/exceptions.py
class ShipmentError(Exception): ...

class InsufficientCapacity(ShipmentError):
    def __init__(self, carrier_id: UUID, requested: Decimal, available: Decimal):
        self.carrier_id = carrier_id
        self.requested = requested
        self.available = available

class ShipmentNotFound(ShipmentError):
    def __init__(self, shipment_id: UUID):
        self.shipment_id = shipment_id
```

Use cases raise and never catch domain exceptions:

```python
# application/shipments/use_cases.py
class BookShipment:
    def execute(self, cmd: BookShipmentCommand) -> UUID:
        with self._uow() as uow:
            available = uow.carrier_capacity.get_available(cmd.carrier_id)
            if available < cmd.weight:
                raise InsufficientCapacity(cmd.carrier_id, cmd.weight, available)
            ...
```

`api/exception_handlers.py` is the only place that knows both the domain exception and the HTTP response shape:

```python
# api/exception_handlers.py
def register_handlers(app: FastAPI) -> None:

    @app.exception_handler(InsufficientCapacity)
    async def handle_insufficient_capacity(request, exc: InsufficientCapacity):
        return JSONResponse(status_code=422, content={
            "code": "insufficient_capacity",
            "carrier_id": str(exc.carrier_id),
            "requested": str(exc.requested),
            "available": str(exc.available),
        })

    @app.exception_handler(ShipmentNotFound)
    async def handle_not_found(request, exc: ShipmentNotFound):
        return JSONResponse(status_code=404, content={
            "code": "shipment_not_found",
            "shipment_id": str(exc.shipment_id),
        })

    # Safety net — any domain error without a specific handler
    @app.exception_handler(ShipmentError)
    async def handle_unhandled_domain_error(request, exc: ShipmentError):
        logger.error("unhandled_domain_error", exc_info=exc)
        return JSONResponse(status_code=500, content={"code": "internal_error"})

    # Infrastructure failures → 503
    @app.exception_handler(InfrastructureUnavailable)
    async def handle_infra_error(request, exc: InfrastructureUnavailable):
        logger.error("infrastructure_unavailable",
                     dependency=exc.dependency, exc_info=exc.cause)
        return JSONResponse(status_code=503, content={
            "code": "service_unavailable",
            "dependency": exc.dependency,
        })

    # Programming errors → 500
    @app.exception_handler(Exception)
    async def handle_unexpected(request, exc: Exception):
        logger.exception("unexpected_error", exc_info=exc)
        return JSONResponse(status_code=500, content={"code": "internal_error"})
```

```python
# main.py
def create_app() -> FastAPI:
    app = FastAPI()
    register_handlers(app)
    ...
```

### Infrastructure errors — `packages/common/`, wrapped at the boundary

`InfrastructureUnavailable` lives in `packages/common/exceptions.py` — shared across all services:

```python
# packages/common/exceptions.py
class InfrastructureUnavailable(Exception):
    """Raised when an infrastructure dependency cannot be reached."""
    def __init__(self, dependency: str, cause: Exception):
        self.dependency = dependency
        self.cause = cause
        super().__init__(f"{dependency} unavailable: {cause}")
```

Infrastructure implementations catch their own errors and wrap them:

```python
# infrastructure/shipments/repositories.py
from common.exceptions import InfrastructureUnavailable

class ShipmentSQLAlchemyRepository:
    def get(self, shipment_id: UUID) -> Shipment | None:
        try:
            return self._session.get(ShipmentORM, shipment_id)
        except OperationalError as e:
            raise InfrastructureUnavailable("database", e) from e
```

```python
# infrastructure/shipments/acl.py
class CarrierCapacityAdapter:
    def get_available(self, carrier_id: UUID) -> Decimal:
        try:
            ...
        except (TimeoutError, ConnectionError) as e:
            raise InfrastructureUnavailable("carrier_service", e) from e
```

The cause is logged server-side and never serialised into the response — no internal details leak to clients.

### 503 vs 500 distinction

| Status | Meaning | Source | Client behaviour |
|---|---|---|---|
| 422 | Business rule violation or bad input | Domain exception or Pydantic | Fix the request |
| 404 | Aggregate not found | Domain exception | Fix the request |
| 503 | Infrastructure dependency down | `InfrastructureUnavailable` | Retry with backoff |
| 500 | Programming error | Unhandled exception | Do not retry; alert |

### File layout

```
packages/
└── common/
    └── exceptions.py          # InfrastructureUnavailable

service/
├── domain/
│   └── <context>/
│       └── exceptions.py      # ShipmentError, InsufficientCapacity, etc.
└── api/
    └── exception_handlers.py  # all HTTP mappings in one place
```

## Consequences

**Positive**

- Domain exceptions carry no HTTP knowledge — they are pure business concepts.
- All HTTP mapping is in one file, easy to audit and extend.
- 503 and 500 are structurally distinct — on-call alerting can differentiate infra issues from bugs.
- Internal error details (stack traces, DB errors) never reach clients.
- Base exception handlers act as safety nets — no exception reaches FastAPI's default unhandled handler.

**Negative / constraints**

- Every new domain exception requires a corresponding handler in `api/exception_handlers.py`. The base `ShipmentError` handler catches omissions with a 500, making gaps visible in logs.
- Infrastructure wrapping adds a small amount of boilerplate in every repository and ACL adapter. This is intentional — the wrapping is the documentation that a call can fail.

## Alternatives considered

- **HTTP status codes on domain exceptions** — rejected; couples domain to transport, makes domain exceptions untestable without HTTP context.
- **Catch infrastructure errors in use cases** — rejected; use cases become aware of infrastructure failure modes, violating layer separation.
- **Single global middleware catch-all** — rejected as the sole mechanism; too coarse, loses the 503/500 distinction and structured error bodies per exception type.
