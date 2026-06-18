"""Built-in node-type catalog (ADR-0009).

The single source of truth for node-type metadata, config-field schemas and
declared outputs — replacing the frontend's hardcoded ``NODE_DEFS`` /
``FIELD_DEFS`` / ``OUTPUT_FIELDS`` (closes frontend gap #6). The catalog is a
fixed, curated set authored by us; there is no plugin/extensibility surface in
v1. ``SeedCatalog`` (application layer) upserts these into ``node_type_manifests``.

Conventions used below:

* ``storage_lane`` — all v1 freight nodes emit small outputs, so every type uses
  the Postgres lane (ADR-0002). The S3 lane exists for large outputs added later.
* ``retry_safe`` — ``True`` for triggers and read/decision nodes that can be
  safely re-run; ``False`` for nodes with external side effects (writes, sends,
  carrier assignment) which carry their own dedup burden (ADR-0009/0005).
* ``config_schema`` — the field-definition list the UI renders, ported verbatim
  from the prototype's ``FIELD_DEFS``.
* ``output_spec`` — all v1 types declare ``static`` outputs; the ``from_config``
  machinery (ADR-0014) is exercised by tests and ready for configurable-output
  node types (e.g. a document extractor) without a redesign.
"""

from __future__ import annotations

from apps.flow_backend.domain.node_types.models import (
    NodeTypeManifest,
    OutputSpec,
    StorageLane,
)


# Palette one-liner shown under each step in the editor's node palette.
_DESCRIPTIONS = {
    "trigger": "Fires on a new TMS booking",
    "schedule": "Run on a recurring timer",
    "http_in": "On an inbound HTTP request",
    "condition": "Branch on true / false",
    "filter": "Only continue if…",
    "delay": "Wait before continuing",
    "enrich": "Lane intelligence lookup",
    "assign": "Match the best carrier",
    "record": "Write to a table",
    "notify": "Post to a Slack channel",
    "email": "Email a contact",
}

# Default subtitle stamped on a freshly-added (and re-configured) node.
_SUBTITLES = {
    "trigger": "TMS · Webhook",
    "schedule": "Every day · 06:00",
    "http_in": "HTTP · POST",
    "condition": "If / else",
    "filter": "Continue if…",
    "delay": "Wait 5 min",
    "enrich": "Lane Intelligence",
    "assign": "Carrier Match",
    "record": "Database",
    "notify": "Slack",
    "email": "Email",
}


def _manifest(
    type_id: str,
    *,
    category: str,
    title: str,
    icon: str,
    fields: list[dict],
    outputs: list[tuple[str, str]],
    retry_safe: bool,
    storage_lane: StorageLane = StorageLane.POSTGRES,
) -> NodeTypeManifest:
    return NodeTypeManifest(
        type_id=type_id,
        category=category,
        display={
            "title": title,
            "icon": icon,
            "description": _DESCRIPTIONS.get(type_id, ""),
            "subtitle": _SUBTITLES.get(type_id, ""),
        },
        config_schema={"fields": fields},
        output_spec=OutputSpec.static_outputs(outputs),
        storage_lane=storage_lane,
        retry_safe=retry_safe,
    )


BUILTIN_CATALOG: list[NodeTypeManifest] = [
    # ── Triggers ──────────────────────────────────────────────────────────────
    _manifest(
        "trigger",
        category="trigger",
        title="Shipment Booked",
        icon="bolt",
        fields=[
            {
                "key": "event",
                "label": "Trigger event",
                "type": "select",
                "options": [
                    "Shipment Booked",
                    "Shipment Updated",
                    "Shipment Cancelled",
                    "Status Changed",
                ],
                "required": True,
            },
            {
                "key": "source",
                "label": "Source system",
                "type": "select",
                "options": ["TMS", "EDI 204", "Customer Portal", "API"],
                "required": True,
            },
            {
                "key": "filter",
                "label": "Filter (optional)",
                "type": "text",
                "placeholder": "e.g. mode = FTL",
                "help": "Only trigger on shipments matching this expression.",
            },
        ],
        outputs=[
            ("shipment.id", "string"),
            ("shipment.lane", "string"),
            ("shipment.mode", "string"),
            ("shipment.pickup_date", "string"),
        ],
        retry_safe=True,
    ),
    _manifest(
        "schedule",
        category="trigger",
        title="Schedule",
        icon="clock",
        fields=[
            {
                "key": "cadence",
                "label": "Cadence",
                "type": "select",
                "options": ["Every hour", "Every day", "Every weekday", "Custom cron"],
                "required": True,
            },
            {"key": "time", "label": "Run at", "type": "text", "placeholder": "06:00"},
            {
                "key": "tz",
                "label": "Timezone",
                "type": "select",
                "options": ["America/Chicago", "America/Los_Angeles", "UTC"],
            },
        ],
        outputs=[],
        retry_safe=True,
    ),
    _manifest(
        "http_in",
        category="trigger",
        title="Incoming Webhook",
        icon="globe",
        fields=[
            {
                "key": "method",
                "label": "Method",
                "type": "select",
                "options": ["POST", "GET", "PUT"],
                "required": True,
            },
            {
                "key": "path",
                "label": "Path",
                "type": "text",
                "placeholder": "/hooks/shipment",
                "help": "A unique URL will be generated for this path.",
                "required": True,
            },
        ],
        outputs=[],
        retry_safe=True,
    ),
    # ── Logic ─────────────────────────────────────────────────────────────────
    _manifest(
        "condition",
        category="logic",
        title="Condition",
        icon="branch",
        fields=[
            {
                "key": "field",
                "label": "Field",
                "type": "select",
                "options": ["risk_score", "market_rate", "miles", "weight_lbs", "transit_days"],
                "required": True,
            },
            {
                "key": "operator",
                "label": "Operator",
                "type": "select",
                "options": ["is greater than", "is less than", "equals", "is not", "contains"],
                "required": True,
            },
            {
                "key": "value",
                "label": "Value",
                "type": "text",
                "placeholder": "70",
                "required": True,
            },
        ],
        outputs=[],  # control-flow node; emits a branch decision, not data refs
        retry_safe=True,
    ),
    _manifest(
        "filter",
        category="logic",
        title="Filter",
        icon="filter",
        fields=[
            {
                "key": "field",
                "label": "Field",
                "type": "select",
                "options": ["risk_score", "market_rate", "miles", "mode"],
                "required": True,
            },
            {
                "key": "operator",
                "label": "Operator",
                "type": "select",
                "options": ["is greater than", "is less than", "equals", "contains"],
                "required": True,
            },
            {"key": "value", "label": "Value", "type": "text", "required": True},
        ],
        outputs=[],
        retry_safe=True,
    ),
    _manifest(
        "delay",
        category="logic",
        title="Delay",
        icon="clock",
        fields=[
            {
                "key": "amount",
                "label": "Wait",
                "type": "text",
                "placeholder": "5",
                "required": True,
            },
            {
                "key": "unit",
                "label": "Unit",
                "type": "select",
                "options": ["minutes", "hours", "days"],
            },
        ],
        outputs=[],
        retry_safe=True,
    ),
    # ── Freight actions ───────────────────────────────────────────────────────
    _manifest(
        "enrich",
        category="data",
        title="Enrich Lane & Rate",
        icon="search",
        fields=[
            {
                "key": "dataset",
                "label": "Dataset",
                "type": "select",
                "options": ["Lane Intelligence", "Rate Index", "Carrier Scorecard"],
                "required": True,
            },
            {
                "key": "fields",
                "label": "Fields to enrich",
                "type": "text",
                "placeholder": "miles, transit_days, market_rate",
                "help": "Comma-separated list of attributes to attach.",
                "required": True,
            },
            {
                "key": "cache",
                "label": "Cache results for",
                "type": "select",
                "options": ["No cache", "1 hour", "24 hours"],
            },
        ],
        outputs=[
            ("miles", "number"),
            ("transit_days", "number"),
            ("market_rate", "number"),
            ("risk_score", "number"),
        ],
        retry_safe=True,
    ),
    _manifest(
        "assign",
        category="action",
        title="Assign Carrier",
        icon="truck",
        fields=[
            {
                "key": "strategy",
                "label": "Matching strategy",
                "type": "select",
                "options": ["Cheapest", "Fastest", "Highest score", "Preferred first"],
                "required": True,
            },
            {
                "key": "pool",
                "label": "Carrier pool",
                "type": "select",
                "options": ["All carriers", "Preferred carriers", "Spot market"],
                "required": True,
            },
            {
                "key": "maxRate",
                "label": "Max rate / mi",
                "type": "text",
                "placeholder": "2.10",
                "help": "Skip carriers above this rate.",
            },
        ],
        outputs=[
            ("carrier_id", "string"),
            ("carrier", "string"),
            ("dispatch_email", "string"),
            ("rate", "number"),
        ],
        retry_safe=False,  # assignment commits a carrier decision — re-run with care
    ),
    _manifest(
        "record",
        category="data",
        title="Create Record",
        icon="db",
        fields=[
            {
                "key": "table",
                "label": "Table",
                "type": "select",
                "options": ["", "Shipments", "Tracking", "Tasks", "Exceptions"],
                "required": True,
            },
            {
                "key": "mapping",
                "label": "Field mapping",
                "type": "textarea",
                "placeholder": "shipment_id, carrier_id, status",
                "help": "One field per line or comma-separated.",
                "required": True,
            },
        ],
        outputs=[
            ("id", "string"),
            ("status", "string"),
        ],
        retry_safe=False,  # writes a row
    ),
    # ── Communication ─────────────────────────────────────────────────────────
    _manifest(
        "notify",
        category="comm",
        title="Notify Team",
        icon="bell",
        fields=[
            {
                "key": "channel",
                "label": "Channel",
                "type": "text",
                "placeholder": "#ops-alerts",
                "required": True,
            },
            {
                "key": "message",
                "label": "Message",
                "type": "textarea",
                "placeholder": "Type a message, or insert data with { }",
                "required": True,
            },
        ],
        outputs=[
            ("ts", "string"),
            ("status", "string"),
        ],
        retry_safe=False,  # posts a message
    ),
    _manifest(
        "email",
        category="comm",
        title="Send Email",
        icon="mail",
        fields=[
            {
                "key": "to",
                "label": "To",
                "type": "text",
                "placeholder": "recipient@example.com",
                "required": True,
            },
            {
                "key": "subject",
                "label": "Subject",
                "type": "text",
                "placeholder": "Email subject line",
                "required": True,
            },
            {
                "key": "body",
                "label": "Body",
                "type": "textarea",
                "placeholder": "Write the email body, or insert data with { }",
                "required": True,
            },
        ],
        outputs=[
            ("message_id", "string"),
            ("status", "string"),
        ],
        retry_safe=False,  # sends an email
    ),
]
