"""Repository Protocols for the identity context (ADR-0018, ADR-0019).

Only Protocol definitions live here. Concrete SQLAlchemy implementations are in
infrastructure/identity/repositories.py.
"""

from typing import Protocol

from apps.flow_backend.domain.identity.models import OrgMembership, Role, User
from apps.flow_backend.domain.shared.value_objects import TenantId


class UserRepository(Protocol):
    async def get_by_email(self, email: str) -> User | None:
        """Look up a user by email (for login), or None."""
        ...

    async def add(self, user: User) -> None:
        """Persist a new user."""
        ...


class MembershipRepository(Protocol):
    async def get_role(self, user_id: str, tenant_id: TenantId) -> Role | None:
        """Return the user's role in the org, or None if not a member."""
        ...

    async def list_for_user(self, user_id: str) -> list[OrgMembership]:
        """All of a user's org memberships (org id, name, role).

        Reads across orgs without an active tenant, so it goes through the
        privileged ``app_user_memberships`` function (RLS would otherwise hide
        every row).
        """
        ...
