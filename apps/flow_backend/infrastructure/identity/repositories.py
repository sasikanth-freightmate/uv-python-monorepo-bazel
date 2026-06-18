"""Concrete SQLAlchemy implementations of the identity repositories.

Satisfy the domain Protocols via structural subtyping (ADR-0019). Low-level
errors are wrapped in InfrastructureUnavailable for the 503 mapping.
"""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from apps.flow_backend.domain.identity.models import OrgMembership, Role, User
from apps.flow_backend.domain.shared.value_objects import TenantId
from apps.flow_backend.infrastructure.identity.orm import MembershipORM, UserORM
from packages.common.exceptions import InfrastructureUnavailable


def _to_user(row: UserORM) -> User:
    return User(
        id=row.id,
        email=row.email,
        password_hash=row.password_hash,
        display_name=row.display_name,
    )


class UserSQLAlchemyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str) -> User | None:
        try:
            result = await self._session.execute(
                select(UserORM).where(UserORM.email == email)
            )
            row = result.scalar_one_or_none()
            return _to_user(row) if row is not None else None
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def add(self, user: User) -> None:
        try:
            self._session.add(
                UserORM(
                    id=user.id,
                    email=user.email,
                    password_hash=user.password_hash,
                    display_name=user.display_name,
                    created_at=func.now(),
                )
            )
            await self._session.flush()
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e


class MembershipSQLAlchemyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_role(self, user_id: str, tenant_id: TenantId) -> Role | None:
        """Resolve the user's role in the org.

        RLS already restricts visible ``memberships`` rows to the active org
        (``app.tenant_id``); the explicit tenant filter is belt-and-suspenders.
        """
        try:
            result = await self._session.execute(
                select(MembershipORM.role).where(
                    MembershipORM.user_id == user_id,
                    MembershipORM.tenant_id == tenant_id,
                )
            )
            role = result.scalar_one_or_none()
            return Role(role) if role is not None else None
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e

    async def list_for_user(self, user_id: str) -> list[OrgMembership]:
        """All of a user's memberships, across orgs, with org names.

        Goes through the ``app_user_memberships`` SECURITY DEFINER function so it
        works with no active tenant bound (RLS on ``memberships`` would otherwise
        return nothing).
        """
        try:
            result = await self._session.execute(
                text(
                    "SELECT org_id, org_name, role FROM app_user_memberships(:uid)"
                ),
                {"uid": user_id},
            )
            return [
                OrgMembership(org_id=TenantId(row.org_id), org_name=row.org_name, role=Role(row.role))
                for row in result
            ]
        except Exception as e:
            raise InfrastructureUnavailable("database", e) from e
