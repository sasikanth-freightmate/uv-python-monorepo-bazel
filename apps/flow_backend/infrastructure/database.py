from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from apps.flow_backend.infrastructure.auth.tenant_context import current_org_id


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for all ORM models in this service."""


class Database:
    def __init__(self, db_url: str, pool_size: int = 10, pool_timeout: int = 30) -> None:
        self._engine = create_async_engine(
            db_url,
            pool_size=pool_size,
            pool_timeout=pool_timeout,
            pool_pre_ping=True,
        )
        self._session_factory = async_sessionmaker(
            self._engine,
            expire_on_commit=False,
            class_=AsyncSession,
        )

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._session_factory() as session:
            org_id = current_org_id()
            if org_id is not None:
                # Transaction-scoped (is_local=True) RLS variable. set_config is
                # the parameterised, injection-safe equivalent of SET LOCAL and
                # auto-clears on commit, so pooled connections return clean.
                await session.execute(
                    text("SELECT set_config('app.tenant_id', :org, true)"),
                    {"org": str(org_id)},
                )
            yield session

    async def dispose(self) -> None:
        await self._engine.dispose()
