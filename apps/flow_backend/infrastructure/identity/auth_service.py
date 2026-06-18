"""Email/password authentication service.

Orchestrates the credential side of identity: register a user (hashed password)
and log in (verify password → issue a session token). Active-org/role resolution
stays in MembershipResolver; this only establishes *who* the caller is.
"""

from __future__ import annotations

import uuid

from apps.flow_backend.domain.identity.exceptions import AuthenticationError, EmailAlreadyRegistered
from apps.flow_backend.domain.identity.models import User
from apps.flow_backend.infrastructure.auth.password import PasswordHasher
from apps.flow_backend.infrastructure.auth.token_service import TokenService
from apps.flow_backend.infrastructure.identity.repositories import UserSQLAlchemyRepository


class AuthService:
    def __init__(self, db: object, hasher: PasswordHasher, tokens: TokenService) -> None:
        self._db = db
        self._hasher = hasher
        self._tokens = tokens

    async def register(self, email: str, password: str, display_name: str | None = None) -> str:
        async with self._db.session() as session:
            users = UserSQLAlchemyRepository(session)
            if await users.get_by_email(email) is not None:
                raise EmailAlreadyRegistered(email)
            user_id = str(uuid.uuid4())
            await users.add(
                User(
                    id=user_id,
                    email=email,
                    password_hash=self._hasher.hash(password),
                    display_name=display_name,
                )
            )
            await session.commit()
        return user_id

    async def login(self, email: str, password: str) -> str:
        async with self._db.session() as session:
            user = await UserSQLAlchemyRepository(session).get_by_email(email)
        if user is None or not self._hasher.verify(password, user.password_hash):
            raise AuthenticationError("invalid credentials")
        return self._tokens.issue(user.id, user.email)
