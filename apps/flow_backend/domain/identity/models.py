"""Identity & membership domain models (ADR-0011).

Pure Python — no ORM, no framework imports. `User.id` is an app-generated
surrogate; email/password are the login credentials; membership/role live in
our Postgres.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from apps.flow_backend.domain.shared.value_objects import TenantId


class Role(str, Enum):
    """Org-scoped role (ADR-0011). Ordered admin > editor > viewer."""

    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


@dataclass(frozen=True)
class User:
    id: str  # app-generated surrogate id
    email: str
    password_hash: str
    display_name: str | None = None


@dataclass(frozen=True)
class Membership:
    user_id: str
    tenant_id: TenantId
    role: Role


@dataclass(frozen=True)
class OrgMembership:
    """A user's membership in one org, with the org's display name.

    The "list my workspaces" view (GET /auth/me): joins membership → org name so
    the client can render and pick an active org without a second round-trip.
    """

    org_id: TenantId
    org_name: str
    role: Role
