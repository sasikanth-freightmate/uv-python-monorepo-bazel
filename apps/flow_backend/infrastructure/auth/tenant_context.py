"""Request-scoped tenant context (ADR-0011).

The resolved active org is carried in a ContextVar so the database session layer
can set the RLS variable (``app.tenant_id``) on every transaction without
threading the org through every command. ContextVars are per-asyncio-Task, and
each request runs in its own Task, so values never leak across requests.

When the ContextVar is unset (background jobs, unauthenticated paths), no RLS
variable is set and Postgres RLS fails closed — exactly the safe default.
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass

from apps.flow_backend.domain.identity.models import Role
from apps.flow_backend.domain.shared.value_objects import TenantId


@dataclass(frozen=True)
class TenantContext:
    """The authenticated principal + validated active org for a request."""

    org_id: TenantId
    sub: str
    email: str | None
    role: Role


_org_ctx: ContextVar[TenantId | None] = ContextVar("flow_active_org", default=None)


def current_org_id() -> TenantId | None:
    """The active org for the current task, or None (RLS then fails closed)."""
    return _org_ctx.get()


def set_active_org(org_id: TenantId) -> Token:
    """Bind the active org for the current task; returns a reset token."""
    return _org_ctx.set(org_id)


def reset_active_org(token: Token) -> None:
    _org_ctx.reset(token)
