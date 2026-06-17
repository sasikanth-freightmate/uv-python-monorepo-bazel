"""Central HTTP exception mapping (ADR-0024).

All domain exception → HTTP status mappings live here.
Infrastructure failures → 503. Unhandled exceptions → 500.
Internal details are logged server-side and never sent to clients.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from packages.common.exceptions import InfrastructureUnavailable

logger = logging.getLogger(__name__)


def register_handlers(app: FastAPI) -> None:
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
