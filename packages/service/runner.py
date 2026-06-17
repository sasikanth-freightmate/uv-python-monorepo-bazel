"""Reusable uvicorn runner for serving a FastAPI app."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI


def build_server(app: FastAPI, *, host: str, port: int, log_level: str = "info") -> uvicorn.Server:
    """Build (without starting) the uvicorn server for an app."""
    return uvicorn.Server(
        uvicorn.Config(app, host=host, port=port, log_level=log_level.lower()),
    )


async def serve(app: FastAPI, *, host: str, port: int, log_level: str = "info") -> None:
    """Serve an app until terminated."""
    await build_server(app, host=host, port=port, log_level=log_level).serve()
