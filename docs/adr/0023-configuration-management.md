# ADR-0023: Configuration Management via pydantic-settings

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** sasikanth
- **Related:** ADR-0019 (dependency injection)

## Context

Services need configuration for database URLs, cache endpoints, feature flags, and other environment-specific values. `python-dependency-injector` provides a native `providers.Configuration` that loads YAML or env vars, but it offers no type safety or startup validation — a missing required value fails at the point of use, not at startup. A clearer approach is needed that validates config eagerly, provides type safety, and keeps sensitive values out of committed files.

## Decision

`pydantic-settings` owns all config loading and validation. The DI container consumes it as a singleton. `providers.Configuration` is not used.

### Settings class

```python
# infrastructure/config.py
from pydantic import PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    db_url: PostgresDsn
    db_pool_size: int = 10
    db_pool_timeout: int = 30

    # Cache
    redis_url: RedisDsn

    # App
    debug: bool = False
    log_level: str = "INFO"
    allowed_hosts: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        env_file_encoding="utf-8",
    )
```

All fields are typed. Pydantic validates on instantiation — a missing `APP_DB_URL` raises `ValidationError` at startup with a clear message, not at the first DB call.

### Container wiring

```python
# containers.py
class ApplicationContainer(containers.DeclarativeContainer):
    settings = providers.Singleton(Settings)

    db = providers.Singleton(
        Database,
        db_url=settings.provided.db_url,
        pool_size=settings.provided.db_pool_size,
    )
    cache = providers.Singleton(
        RedisCache,
        url=settings.provided.redis_url,
    )
    shipments = providers.Container(ShipmentsContainer, db=db)
```

`providers.Singleton(Settings)` instantiates and validates once. The container passes specific values — not the `Settings` object — to infrastructure components.

### Local development

`.env` is gitignored. `.env.example` is committed with all keys and placeholder values:

```bash
# .env.example — commit this
APP_DB_URL=postgresql+asyncpg://user:pass@localhost:5432/dbname
APP_REDIS_URL=redis://localhost:6379/0
APP_DEBUG=true
APP_LOG_LEVEL=DEBUG
```

Developers copy `.env.example` to `.env` and fill in local values.

### Production

Environment variables are injected by the deployment platform (Kubernetes secrets, Cloud Run env vars, etc.). No `.env` file is present. `pydantic-settings` reads `os.environ` directly when no `.env` file is found.

For secrets manager integration, add a custom settings source:

```python
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource

class SecretsManagerSource(PydanticBaseSettingsSource):
    def get_field_value(self, field, field_name):
        # fetch from AWS Secrets Manager / GCP Secret Manager
        ...

class Settings(BaseSettings):
    @classmethod
    def settings_customise_sources(cls, settings_cls, **kwargs):
        return (
            kwargs["env_settings"],          # env vars win
            SecretsManagerSource(settings_cls),  # secrets manager fallback
            kwargs["dotenv_settings"],        # .env for local only
        )
```

### What the domain layer sees

The domain layer never imports from `infrastructure/config.py`. Config values are injected as primitives by the container into infrastructure and application components:

```python
# Good — infrastructure receives a value
providers.Singleton(Database, db_url=settings.provided.db_url)

# Bad — passing the whole Settings object into a service
providers.Factory(ShipmentService, settings=settings)
```

Domain services and aggregates receive no config at all. Application use cases receive only what they need, as typed primitives injected via the UoW or constructor.

### File layout

```
service/
├── .env                  # gitignored — local values
├── .env.example          # committed — template with all keys
├── infrastructure/
│   └── config.py         # Settings class only
└── containers.py         # consumes Settings as providers.Singleton
```

## Consequences

**Positive**

- Config is validated at startup — missing or malformed values fail fast with a clear error.
- Full type safety and IDE completion on `Settings` fields.
- Sensitive values never appear in committed files.
- Secrets manager support is addable without changing the container or any service code.
- `Settings` is easily overridden in tests: `app.container.settings.override(mock_settings)`.

**Negative / constraints**

- All required env vars must be set before the process starts — no lazy loading. This is intentional.
- `APP_` prefix is mandatory for all env vars to avoid collisions with system env vars.

## Alternatives considered

- **`providers.Configuration` with YAML** — rejected; no type safety, runtime failures on missing keys, requires committing config files that may contain secrets.
- **`os.environ` directly in containers** — rejected; no validation, no defaults, scattered across the codebase.
- **Dynaconf** — rejected; adds another dependency without meaningful benefit over `pydantic-settings` given we already use Pydantic throughout.
