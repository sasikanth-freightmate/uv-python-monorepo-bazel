"""Auth endpoints — email/password register & login (only layer using @inject).

Login issues our HS256 session token and sets it as an httpOnly cookie
(``fm_flow_token``); the browser then authenticates by cookie on same-origin
calls and never exposes the token to JS. ``/me`` reports identity + workspaces;
``/logout`` clears the cookie.
"""

from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Request, Response

from apps.flow_backend.api.auth.dependencies import SESSION_COOKIE, get_identity
from apps.flow_backend.api.auth.schemas import (
    LoginRequest,
    MembershipView,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserView,
)
from apps.flow_backend.config import Settings
from apps.flow_backend.containers import ApplicationContainer
from apps.flow_backend.infrastructure.auth.token_service import Claims
from apps.flow_backend.infrastructure.identity.auth_service import AuthService
from apps.flow_backend.infrastructure.identity.resolver import MembershipResolver

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
@inject
async def register(
    body: RegisterRequest,
    service: Annotated[AuthService, Depends(Provide[ApplicationContainer.identity.auth_service])],
) -> dict:
    user_id = await service.register(body.email, body.password, body.display_name)
    return {"user_id": user_id}


@router.post("/login", response_model=TokenResponse)
@inject
async def login(
    body: LoginRequest,
    response: Response,
    service: Annotated[AuthService, Depends(Provide[ApplicationContainer.identity.auth_service])],
    settings: Annotated[Settings, Depends(Provide[ApplicationContainer.settings])],
) -> TokenResponse:
    token = await service.login(body.email, body.password)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.jwt_ttl_seconds,
        path="/",
    )
    # The body token keeps non-browser clients / tests working; browsers ignore
    # it and rely on the httpOnly cookie above.
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    # Stateless JWT: this drops the cookie; the token stays valid until exp (no
    # server-side revocation in v1).
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=MeResponse)
@inject
async def me(
    claims: Annotated[Claims, Depends(get_identity)],
    resolver: Annotated[MembershipResolver, Depends(Provide[ApplicationContainer.identity.resolver])],
) -> MeResponse:
    memberships = await resolver.list_for_user(claims.sub)
    return MeResponse(
        user=UserView(id=claims.sub, email=claims.email),
        memberships=[MembershipView.from_domain(m) for m in memberships],
    )
