"""Seed a dev account so you can actually log in locally.

    bazel run //apps/flow_backend:seed_dev

Creates (idempotently) one org, one user with a real scrypt password hash, and an
admin membership joining them. Connects as the **owner** via
``MIGRATION_DATABASE_URL`` — the same privileged role migrations use — because the
membership insert must bypass RLS (the least-privilege ``flow`` role can't write a
``memberships`` row without an active tenant bound).

Re-running is safe: the org/user are upserted by fixed id and the membership is a
no-op on conflict. The user's password is reset to ``DEV_PASSWORD`` each run.
"""

from __future__ import annotations

import asyncio
import logging
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from apps.flow_backend.infrastructure.auth.password import PasswordHasher

# Fixed ids keep re-runs deterministic (upsert by primary key).
DEV_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEV_ORG_NAME = "Dev Org"
DEV_USER_ID = "00000000-0000-0000-0000-0000000000a1"
DEV_EMAIL = "dev@freightmate.test"
DEV_PASSWORD = "devpass123"

logger = logging.getLogger(__name__)


async def _seed(db_url: str) -> None:
    engine = create_async_engine(db_url)
    password_hash = PasswordHasher().hash(DEV_PASSWORD)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO orgs (id, name, created_at) VALUES (:id, :name, now()) "
                    "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"
                ),
                {"id": DEV_ORG_ID, "name": DEV_ORG_NAME},
            )
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, display_name, created_at) "
                    "VALUES (:id, :email, :ph, :dn, now()) "
                    "ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, "
                    "password_hash = EXCLUDED.password_hash"
                ),
                {"id": DEV_USER_ID, "email": DEV_EMAIL, "ph": password_hash, "dn": "Dev User"},
            )
            await conn.execute(
                text(
                    "INSERT INTO memberships (user_id, tenant_id, role) "
                    "VALUES (:uid, :oid, 'admin') ON CONFLICT DO NOTHING"
                ),
                {"uid": DEV_USER_ID, "oid": DEV_ORG_ID},
            )
    finally:
        await engine.dispose()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)-5.5s [%(name)s] %(message)s")
    db_url = os.environ.get("MIGRATION_DATABASE_URL")
    if not db_url:
        raise SystemExit(
            "MIGRATION_DATABASE_URL is required (the owner role that bypasses RLS). "
            "It is set in the devcontainer; export it if running elsewhere."
        )
    asyncio.run(_seed(db_url))
    logger.info("Seeded dev account — email=%s password=%s org=%s (admin)", DEV_EMAIL, DEV_PASSWORD, DEV_ORG_NAME)


if __name__ == "__main__":
    main()
