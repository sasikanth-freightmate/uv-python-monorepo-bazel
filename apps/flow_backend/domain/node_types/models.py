"""Node-type registry aggregate — pure Python, no framework imports (ADR-0018).

A node type is a *manifest* (declarative data served to the UI and consumed by
validation + the engine) keyed by ``type_id`` (ADR-0009). The executor that runs
nodes of this type is compiled into the worker — it is code, not data, so it
lives outside this model.

The interesting piece of logic here is :class:`OutputSpec.resolve`, which turns a
node type's declared-output contract (ADR-0003) into concrete fields. It is one
of two kinds (ADR-0014):

* ``static``       — a fixed list of ``{path, type}`` (e.g. Send Email →
  ``message_id``, ``status``); independent of the node instance's config.
* ``from_config``  — a declarative projection of a repeatable config field into
  outputs (e.g. a document extractor's ``fields[]`` → one output per entry).

``static`` is the trivial case of the general resolver, so both flow through the
same ``resolve(config)`` method.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class StorageLane(str, Enum):
    """Where a node type's output is persisted (ADR-0002)."""

    POSTGRES = "postgres"
    S3 = "s3"


class OutputSpecKind(str, Enum):
    STATIC = "static"
    FROM_CONFIG = "from_config"


@dataclass(frozen=True)
class OutputField:
    """A single declared output: a reference path and its CEL type (ADR-0003/0010)."""

    path: str
    type: str


@dataclass(frozen=True)
class OutputSpec:
    """How a node type's declared outputs are determined (ADR-0009 + ADR-0014).

    Resolution is declarative on purpose: the frontend computes a node's outputs
    locally from its config (no backend round-trip), and validation/type-checking
    stay straightforward.
    """

    kind: OutputSpecKind
    # static
    fields: tuple[OutputField, ...] = ()
    # from_config
    source: str | None = None  # config key holding the repeatable list
    path_key: str = "name"  # entry attribute projected to the output path
    type_key: str = "type"  # entry attribute projected to the output type
    default_type: str = "string"  # type used when an entry omits ``type_key``

    # ── Factories ─────────────────────────────────────────────────────────────

    @classmethod
    def static_outputs(cls, fields: list[tuple[str, str]] | list[OutputField]) -> OutputSpec:
        resolved = tuple(
            f if isinstance(f, OutputField) else OutputField(f[0], f[1]) for f in fields
        )
        return cls(kind=OutputSpecKind.STATIC, fields=resolved)

    @classmethod
    def from_config(
        cls,
        source: str,
        *,
        path_key: str = "name",
        type_key: str = "type",
        default_type: str = "string",
    ) -> OutputSpec:
        return cls(
            kind=OutputSpecKind.FROM_CONFIG,
            source=source,
            path_key=path_key,
            type_key=type_key,
            default_type=default_type,
        )

    # ── Resolution ────────────────────────────────────────────────────────────

    def resolve(self, config: dict | None = None) -> list[OutputField]:
        """Concrete declared outputs for a node instance with the given config."""
        if self.kind is OutputSpecKind.STATIC:
            return list(self.fields)

        # from_config: project each entry of config[source] into an output.
        entries = (config or {}).get(self.source) or []
        outputs: list[OutputField] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            path = entry.get(self.path_key)
            if not path:  # entries without a name produce no addressable output
                continue
            outputs.append(
                OutputField(path=str(path), type=str(entry.get(self.type_key) or self.default_type))
            )
        return outputs

    # ── JSONB (de)serialisation ───────────────────────────────────────────────

    def to_dict(self) -> dict:
        if self.kind is OutputSpecKind.STATIC:
            return {
                "kind": self.kind.value,
                "fields": [{"path": f.path, "type": f.type} for f in self.fields],
            }
        return {
            "kind": self.kind.value,
            "source": self.source,
            "path_key": self.path_key,
            "type_key": self.type_key,
            "default_type": self.default_type,
        }

    @classmethod
    def from_dict(cls, data: dict) -> OutputSpec:
        kind = OutputSpecKind(data.get("kind", OutputSpecKind.STATIC.value))
        if kind is OutputSpecKind.STATIC:
            fields = tuple(OutputField(f["path"], f["type"]) for f in data.get("fields", []))
            return cls(kind=kind, fields=fields)
        return cls(
            kind=kind,
            source=data.get("source"),
            path_key=data.get("path_key", "name"),
            type_key=data.get("type_key", "type"),
            default_type=data.get("default_type", "string"),
        )


@dataclass(frozen=True)
class NodeTypeManifest:
    """A built-in node type's manifest (ADR-0009). Global, latest-only, no tenant."""

    type_id: str
    category: str
    display: dict  # title, icon, color
    config_schema: dict  # replaces the frontend's FIELD_DEFS
    output_spec: OutputSpec
    storage_lane: StorageLane
    retry_safe: bool  # gates "Retry from here" (ADR-0005)
