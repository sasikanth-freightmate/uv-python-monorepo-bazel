"""Identity domain errors → mapped to HTTP status in api/exception_handlers.py."""

from __future__ import annotations


class IdentityError(Exception):
    """Base for all identity/auth errors."""


class AuthenticationError(IdentityError):
    """Missing/invalid token or bad credentials — not authenticated (→ 401)."""

    def __init__(self, reason: str = "invalid token") -> None:
        self.reason = reason
        super().__init__(reason)


class EmailAlreadyRegistered(IdentityError):
    """Registration with an email that already exists (→ 409)."""

    def __init__(self, email: str) -> None:
        self.email = email
        super().__init__(f"email already registered: {email}")


class MissingActiveOrg(IdentityError):
    """No active org supplied on the request (→ 400)."""

    def __init__(self) -> None:
        super().__init__("missing active org")


class MembershipNotFound(IdentityError):
    """Authenticated, but not a member of the requested org (→ 403)."""

    def __init__(self, user_id: str, tenant_id: object) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        super().__init__(f"user {user_id} is not a member of org {tenant_id}")


class InsufficientRole(IdentityError):
    """A member, but the role is too low for the operation (→ 403)."""

    def __init__(self, required: object, actual: object) -> None:
        self.required = required
        self.actual = actual
        super().__init__(f"role {actual} insufficient; requires {required}")
