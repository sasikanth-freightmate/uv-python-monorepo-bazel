"""Pydantic request/response schemas for the auth API."""

import uuid

from pydantic import BaseModel

from apps.flow_backend.domain.identity.models import OrgMembership


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserView(BaseModel):
    id: str
    email: str | None = None


class MembershipView(BaseModel):
    org_id: uuid.UUID
    org_name: str
    role: str

    @classmethod
    def from_domain(cls, m: OrgMembership) -> "MembershipView":
        return cls(org_id=m.org_id, org_name=m.org_name, role=m.role.value)


class MeResponse(BaseModel):
    """Identity + workspaces for the signed-in user (GET /auth/me)."""

    user: UserView
    memberships: list[MembershipView]
