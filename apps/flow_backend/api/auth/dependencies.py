"""FastAPI auth dependencies (ADR-0011).

`get_tenant_context` is the single entry point that turns a request into an
authenticated, org-scoped principal:

  1. validate the bearer JWT (our HS256 session token) → identity claims;
  2. read the active org from the ``X-Org-Id`` header (validated, never trusted);
  3. bind it in the tenant ContextVar so the DB session sets the RLS variable;
  4. JIT-provision the user and validate membership → role.

It is a plain dependency (not ``@inject``) so the ContextVar can be reset in a
``finally`` after the response; collaborators come from ``app.container``.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import Depends, Header, Request

from apps.flow_backend.domain.identity.exceptions import (
    AuthenticationError,
    InsufficientRole,
    MissingActiveOrg,
)
from apps.flow_backend.domain.identity.models import Role
from apps.flow_backend.domain.shared.value_objects import TenantId
from apps.flow_backend.infrastructure.auth.token_service import Claims
from apps.flow_backend.infrastructure.auth.tenant_context import (
    TenantContext,
    reset_active_org,
    set_active_org,
)

# Name of the httpOnly session cookie the API sets on login. The browser sends it
# automatically on same-origin requests; non-browser clients use Authorization.
SESSION_COOKIE = "fm_flow_token"

# admin > editor > viewer — higher rank satisfies any lower requirement.
_ROLE_RANK = {Role.VIEWER: 0, Role.EDITOR: 1, Role.ADMIN: 2}


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthenticationError("missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("malformed Authorization header")
    return token


def _extract_token(request: Request) -> str:
    """The session token, cookie-first with an ``Authorization`` fallback.

    Browsers authenticate via the httpOnly cookie; curl / integration tests and
    any non-browser client keep using ``Authorization: Bearer``.
    """
    cookie = request.cookies.get(SESSION_COOKIE)
    if cookie:
        return cookie
    return _bearer_token(request.headers.get("authorization"))


def _active_org(x_org_id: str | None) -> TenantId:
    if not x_org_id:
        raise MissingActiveOrg()
    try:
        return TenantId(uuid.UUID(x_org_id))
    except ValueError as exc:
        raise MissingActiveOrg() from exc


def get_identity(request: Request) -> Claims:
    """Authenticate the request by JWT only — *who*, with no active org.

    Used by identity-scoped endpoints (``/auth/me``) and as the first half of
    ``get_tenant_context``. Keeps "who are you" separate from "which org".
    """
    return request.app.container.identity.tokens().verify(_extract_token(request))


async def get_tenant_context(
    request: Request,
    claims: Annotated[Claims, Depends(get_identity)],
    x_org_id: Annotated[str | None, Header(alias="X-Org-Id")] = None,
) -> AsyncIterator[TenantContext]:
    resolver = request.app.container.identity.resolver()
    org_id = _active_org(x_org_id)

    token = set_active_org(org_id)
    try:
        yield await resolver.resolve(claims, org_id)
    finally:
        reset_active_org(token)


def require_role(minimum: Role) -> Callable[[TenantContext], TenantContext]:
    """Guard factory: 403 unless the principal's role meets ``minimum``.

    Built now; applied per-endpoint by the PRs that add guarded operations.
    """

    def _guard(
        ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    ) -> TenantContext:
        if _ROLE_RANK[ctx.role] < _ROLE_RANK[minimum]:
            raise InsufficientRole(required=minimum.value, actual=ctx.role.value)
        return ctx

    return _guard
