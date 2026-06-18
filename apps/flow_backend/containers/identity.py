"""Identity bounded context DI sub-container (ADR-0019)."""

from dependency_injector import containers, providers

from apps.flow_backend.infrastructure.auth.password import PasswordHasher
from apps.flow_backend.infrastructure.auth.token_service import TokenService
from apps.flow_backend.infrastructure.identity.auth_service import AuthService
from apps.flow_backend.infrastructure.identity.resolver import MembershipResolver


class IdentityContainer(containers.DeclarativeContainer):
    db = providers.Dependency()
    settings = providers.Dependency()

    tokens = providers.Singleton(
        TokenService,
        secret=providers.Callable(lambda s: s.jwt_secret, settings),
        ttl_seconds=providers.Callable(lambda s: s.jwt_ttl_seconds, settings),
    )

    password_hasher = providers.Singleton(PasswordHasher)

    auth_service = providers.Factory(
        AuthService, db=db, hasher=password_hasher, tokens=tokens
    )

    resolver = providers.Factory(MembershipResolver, db=db)
