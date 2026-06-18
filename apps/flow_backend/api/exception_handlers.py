"""Central HTTP exception mapping (ADR-0024).

All domain exception → HTTP status mappings live here.
Infrastructure failures → 503. Unhandled exceptions → 500.
Internal details are logged server-side and never sent to clients.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from apps.flow_backend.domain.identity.exceptions import (
    AuthenticationError,
    EmailAlreadyRegistered,
    InsufficientRole,
    MembershipNotFound,
    MissingActiveOrg,
)
from packages.common.exceptions import InfrastructureUnavailable

logger = logging.getLogger(__name__)


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(AuthenticationError)
    async def handle_authn(request: Request, exc: AuthenticationError) -> JSONResponse:
        return JSONResponse(status_code=401, content={"code": "unauthenticated"})

    @app.exception_handler(MissingActiveOrg)
    async def handle_missing_org(request: Request, exc: MissingActiveOrg) -> JSONResponse:
        return JSONResponse(status_code=400, content={"code": "missing_active_org"})

    @app.exception_handler(MembershipNotFound)
    async def handle_membership(request: Request, exc: MembershipNotFound) -> JSONResponse:
        return JSONResponse(status_code=403, content={"code": "forbidden"})

    @app.exception_handler(EmailAlreadyRegistered)
    async def handle_email_taken(request: Request, exc: EmailAlreadyRegistered) -> JSONResponse:
        return JSONResponse(status_code=409, content={"code": "email_already_registered"})

    @app.exception_handler(InsufficientRole)
    async def handle_role(request: Request, exc: InsufficientRole) -> JSONResponse:
        return JSONResponse(status_code=403, content={"code": "forbidden"})

    @app.exception_handler(InfrastructureUnavailable)
    async def handle_infra_unavailable(request: Request, exc: InfrastructureUnavailable) -> JSONResponse:
        logger.error(
            "infrastructure_unavailable",
            extra={"dependency": exc.dependency},
            exc_info=exc.cause,
        )
        return JSONResponse(
            status_code=503,
            content={"code": "service_unavailable", "dependency": exc.dependency},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unexpected_error", exc_info=exc)
        return JSONResponse(status_code=500, content={"code": "internal_error"})
