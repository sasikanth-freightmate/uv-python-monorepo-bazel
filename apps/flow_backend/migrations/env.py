"""Alembic migration environment.

URL resolution order (first wins):
  1. ``context.config.attributes["db_url"]`` — injected by programmatic callers
     (e.g. tests) to avoid requiring all Settings fields at migration time.
  2. ``Settings().database_url`` — standard path for CLI use; requires the full
     set of env vars (DATABASE_URL etc.) to be present.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from apps.flow_backend.infrastructure.database import Base
from apps.flow_backend.infrastructure.outbox.models import OutboxMessage  # noqa: F401
from apps.flow_backend.infrastructure.workflows.orm import WorkflowORM  # noqa: F401

alembic_cfg = context.config
if alembic_cfg.config_file_name is not None:
    fileConfig(alembic_cfg.config_file_name)

target_metadata = Base.metadata


def _get_url() -> str:
    if "db_url" in context.config.attributes:
        return str(context.config.attributes["db_url"])
    from apps.flow_backend.config import Settings

    return str(Settings().database_url)


def run_migrations_offline() -> None:
    context.configure(
        url=_get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    engine = create_async_engine(_get_url())
    async with engine.connect() as conn:
        await conn.run_sync(_do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
