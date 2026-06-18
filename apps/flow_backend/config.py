"""Process configuration for the flow-backend monolith.

One build launched per role via `--role` (ADR-0015); everything else comes from
the environment. Extends the shared `BaseServiceSettings` with backend-specific
infra endpoints (ADR-0023).
"""

from __future__ import annotations

import argparse
from enum import Enum

from pydantic import PostgresDsn, RedisDsn
from pydantic_settings import SettingsConfigDict

from packages.service.settings import BaseServiceSettings


class Role(str, Enum):
    """The deployable roles of the one backend build (ADR-0015)."""

    API = "api"
    WORKER = "worker"
    INGESTION = "ingestion"
    GATEWAY = "gateway"
    RECONCILER = "reconciler"


class Settings(BaseServiceSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: PostgresDsn
    redis_url: RedisDsn
    temporal_address: str = "localhost:7233"

    # Local email/password auth: we issue our own HS256 JWTs signed with this
    # secret. Override in any real deployment.
    jwt_secret: str = "dev-insecure-change-me"
    jwt_ttl_seconds: int = 3600

    # Mark the session cookie Secure (HTTPS-only). Off for local dev over plain
    # HTTP; turn on in any deployment served over TLS.
    cookie_secure: bool = False


def parse_role(argv: list[str] | None = None) -> Role:
    """Parse the `--role` process arg into a Role (argparse rejects unknown roles)."""
    parser = argparse.ArgumentParser(prog="flow-backend")
    parser.add_argument(
        "--role",
        required=True,
        choices=[role.value for role in Role],
        help="Which role this process runs as.",
    )
    args = parser.parse_args(argv)
    return Role(args.role)
