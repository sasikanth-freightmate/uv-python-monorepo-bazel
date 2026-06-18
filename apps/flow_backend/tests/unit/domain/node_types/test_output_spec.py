"""Unit tests for the node-type registry domain (ADR-0009, ADR-0014, ADR-0017).

Pure Python — no DB, no framework, no mocks. The focus is ``OutputSpec.resolve``
(static & config-derived) and round-trip (de)serialisation, plus catalog invariants.
"""

import unittest

from apps.flow_backend.domain.node_types.catalog import BUILTIN_CATALOG
from apps.flow_backend.domain.node_types.models import (
    NodeTypeManifest,
    OutputField,
    OutputSpec,
    OutputSpecKind,
    StorageLane,
)


class StaticOutputSpecTest(unittest.TestCase):
    def test_resolve_returns_fixed_fields_ignoring_config(self) -> None:
        spec = OutputSpec.static_outputs([("message_id", "string"), ("status", "string")])
        self.assertEqual(
            spec.resolve({"anything": "ignored"}),
            [OutputField("message_id", "string"), OutputField("status", "string")],
        )

    def test_resolve_with_no_config(self) -> None:
        spec = OutputSpec.static_outputs([("id", "string")])
        self.assertEqual(spec.resolve(), [OutputField("id", "string")])

    def test_empty_static_outputs(self) -> None:
        self.assertEqual(OutputSpec.static_outputs([]).resolve(), [])


class FromConfigOutputSpecTest(unittest.TestCase):
    """ADR-0014 canonical case: a document-extractor whose outputs come from
    a repeatable ``fields[]`` config entry of ``{name, type, prompt}``."""

    def setUp(self) -> None:
        self.spec = OutputSpec.from_config("fields")

    def test_projects_each_config_entry_into_an_output(self) -> None:
        config = {
            "fields": [
                {"name": "invoice_no", "type": "string", "prompt": "the invoice number"},
                {"name": "total", "type": "number", "prompt": "grand total"},
            ]
        }
        self.assertEqual(
            self.spec.resolve(config),
            [OutputField("invoice_no", "string"), OutputField("total", "number")],
        )

    def test_missing_source_key_yields_no_outputs(self) -> None:
        self.assertEqual(self.spec.resolve({}), [])
        self.assertEqual(self.spec.resolve(None), [])

    def test_entry_without_name_is_skipped(self) -> None:
        config = {"fields": [{"type": "string"}, {"name": "ok", "type": "string"}]}
        self.assertEqual(self.spec.resolve(config), [OutputField("ok", "string")])

    def test_entry_without_type_uses_default(self) -> None:
        config = {"fields": [{"name": "note"}]}
        self.assertEqual(self.spec.resolve(config), [OutputField("note", "string")])

    def test_custom_keys_and_default_type(self) -> None:
        spec = OutputSpec.from_config(
            "cols", path_key="col", type_key="dtype", default_type="object"
        )
        config = {"cols": [{"col": "a", "dtype": "number"}, {"col": "b"}]}
        self.assertEqual(
            spec.resolve(config),
            [OutputField("a", "number"), OutputField("b", "object")],
        )

    def test_non_dict_entries_are_ignored(self) -> None:
        config = {"fields": ["nope", 42, {"name": "good", "type": "string"}]}
        self.assertEqual(self.spec.resolve(config), [OutputField("good", "string")])


class OutputSpecSerializationTest(unittest.TestCase):
    def test_static_round_trip(self) -> None:
        spec = OutputSpec.static_outputs([("miles", "number"), ("lane", "string")])
        restored = OutputSpec.from_dict(spec.to_dict())
        self.assertEqual(restored.kind, OutputSpecKind.STATIC)
        self.assertEqual(restored.resolve(), spec.resolve())

    def test_from_config_round_trip(self) -> None:
        spec = OutputSpec.from_config(
            "fields", path_key="name", type_key="type", default_type="object"
        )
        restored = OutputSpec.from_dict(spec.to_dict())
        self.assertEqual(restored.kind, OutputSpecKind.FROM_CONFIG)
        config = {"fields": [{"name": "x", "type": "number"}, {"name": "y"}]}
        self.assertEqual(restored.resolve(config), spec.resolve(config))

    def test_from_dict_defaults_to_static(self) -> None:
        self.assertEqual(OutputSpec.from_dict({}).kind, OutputSpecKind.STATIC)


class BuiltinCatalogTest(unittest.TestCase):
    def test_type_ids_are_unique(self) -> None:
        ids = [m.type_id for m in BUILTIN_CATALOG]
        self.assertEqual(len(ids), len(set(ids)))

    def test_covers_the_frontend_palette(self) -> None:
        expected = {
            "trigger",
            "schedule",
            "http_in",
            "condition",
            "filter",
            "delay",
            "enrich",
            "assign",
            "record",
            "notify",
            "email",
        }
        self.assertEqual({m.type_id for m in BUILTIN_CATALOG}, expected)

    def test_every_manifest_is_well_formed(self) -> None:
        for m in BUILTIN_CATALOG:
            self.assertIsInstance(m, NodeTypeManifest)
            self.assertIsInstance(m.storage_lane, StorageLane)
            self.assertIn("title", m.display)
            self.assertIn("fields", m.config_schema)
            # output_spec resolves without raising for static types
            self.assertIsInstance(m.output_spec.resolve(), list)

    def test_display_carries_palette_metadata(self) -> None:
        # The registry is the single source of truth for what the editor renders
        # (ADR-0009): palette description + default node subtitle live here too.
        for m in BUILTIN_CATALOG:
            self.assertTrue(m.display.get("description"), m.type_id)
            self.assertTrue(m.display.get("subtitle"), m.type_id)
            self.assertIn("icon", m.display)

    def test_side_effecting_nodes_are_not_retry_safe(self) -> None:
        by_id = {m.type_id: m for m in BUILTIN_CATALOG}
        for tid in ("email", "notify", "record", "assign"):
            self.assertFalse(by_id[tid].retry_safe, tid)
        for tid in ("trigger", "condition", "filter", "delay", "enrich"):
            self.assertTrue(by_id[tid].retry_safe, tid)


if __name__ == "__main__":
    unittest.main()
