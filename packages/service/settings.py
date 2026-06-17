"""Common env-driven settings shared by any service role.

Apps extend this with their own fields; field names map to upper-case env vars.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class BaseServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    health_host: str = "0.0.0.0"
    health_port: int = 8080
