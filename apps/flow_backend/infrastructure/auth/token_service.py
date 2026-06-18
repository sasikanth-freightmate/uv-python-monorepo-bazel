"""Session tokens for local email/password auth.

We issue our own short-lived HS256 JWTs (signed with a shared secret) on login
and validate them on each request. The token carries identity only — the active
org and role still come from `memberships` + RLS.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

import jwt

from apps.flow_backend.domain.identity.exceptions import AuthenticationError


@dataclass(frozen=True)
class Claims:
    sub: str
    email: str | None


class TokenService:
    def __init__(self, secret: str, ttl_seconds: int = 3600) -> None:
        self._secret = secret
        self._ttl_seconds = ttl_seconds

    def issue(self, user_id: str, email: str | None) -> str:
        now = datetime.datetime.now(datetime.timezone.utc)
        payload = {
            "sub": user_id,
            "email": email,
            "iat": now,
            "exp": now + datetime.timedelta(seconds=self._ttl_seconds),
        }
        return jwt.encode(payload, self._secret, algorithm="HS256")

    def verify(self, token: str) -> Claims:
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                options={"require": ["exp", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise AuthenticationError(str(exc)) from exc
        return Claims(sub=payload["sub"], email=payload.get("email"))
