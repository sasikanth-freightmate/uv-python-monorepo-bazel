"""Membership resolution (ADR-0011).

Given verified identity claims and a candidate active org, validates membership.
The active org must already be bound in the tenant ContextVar so the session's
RLS variable scopes the membership read to that org — a forged org the user
isn't in simply returns no row.

``list_for_user`` is the cross-org counterpart used by ``/auth/me``: it runs with
no active org and relies on the privileged ``app_user_memberships`` function to
see across tenants.
"""

from __future__ import annotations

from apps.flow_backend.domain.identity.exceptions import MembershipNotFound
from apps.flow_backend.domain.identity.models import OrgMembership
from apps.flow_backend.domain.shared.value_objects import TenantId
from apps.flow_backend.infrastructure.auth.tenant_context import TenantContext
from apps.flow_backend.infrastructure.auth.token_service import Claims
from apps.flow_backend.infrastructure.identity.repositories import MembershipSQLAlchemyRepository


class MembershipResolver:
    def __init__(self, db: object) -> None:
        self._db = db

    async def resolve(self, claims: Claims, org_id: TenantId) -> TenantContext:
        async with self._db.session() as session:
            role = await MembershipSQLAlchemyRepository(session).get_role(claims.sub, org_id)

        if role is None:
            raise MembershipNotFound(claims.sub, org_id)

        return TenantContext(org_id=org_id, sub=claims.sub, email=claims.email, role=role)

    async def list_for_user(self, sub: str) -> list[OrgMembership]:
        """Every org the user belongs to (for the workspace picker)."""
        async with self._db.session() as session:
            return await MembershipSQLAlchemyRepository(session).list_for_user(sub)
