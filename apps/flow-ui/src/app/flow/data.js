// Seed data for the FM Flow prototype — workflows, run history, version
// snapshots, the step palette, the initial canvas graph and per-node samples.
// Ported verbatim from the design so the app shows the same freight scenario.

export const PALETTE = [
  { title: 'Triggers', items: [
    { type: 'trigger', label: 'Shipment Booked', desc: 'Fires on a new TMS booking', kind: 'bolt', cat: 'trigger' },
    { type: 'schedule', label: 'Schedule', desc: 'Run on a recurring timer', kind: 'clock', cat: 'trigger' },
    { type: 'http_in', label: 'Incoming Webhook', desc: 'On an inbound HTTP request', kind: 'globe', cat: 'trigger' },
  ] },
  { title: 'Logic', items: [
    { type: 'condition', label: 'Condition', desc: 'Branch on true / false', kind: 'branch', cat: 'logic' },
    { type: 'filter', label: 'Filter', desc: 'Only continue if…', kind: 'filter', cat: 'logic' },
    { type: 'delay', label: 'Delay', desc: 'Wait before continuing', kind: 'clock', cat: 'logic' },
  ] },
  { title: 'Freight actions', items: [
    { type: 'enrich', label: 'Enrich Lane & Rate', desc: 'Lane intelligence lookup', kind: 'search', cat: 'data' },
    { type: 'assign', label: 'Assign Carrier', desc: 'Match the best carrier', kind: 'truck', cat: 'action' },
    { type: 'record', label: 'Create Record', desc: 'Write to a table', kind: 'db', cat: 'data' },
  ] },
  { title: 'Communication', items: [
    { type: 'notify', label: 'Notify Team', desc: 'Post to a Slack channel', kind: 'bell', cat: 'comm' },
    { type: 'email', label: 'Send Email', desc: 'Email a contact', kind: 'mail', cat: 'comm' },
  ] },
]

export const WORKFLOWS = [
  { id: 'wf1', name: 'New Shipment Intake', status: 'active', trigger: 'Shipment Booked', steps: 8, runs: 1043, success: 98.4, last: '2 min ago', lastStatus: 'success' },
  { id: 'wf2', name: 'Carrier Tender & Confirm', status: 'active', trigger: 'Lane assigned', steps: 6, runs: 842, success: 96.1, last: '12 min ago', lastStatus: 'success' },
  { id: 'wf3', name: 'Exception · Late Pickup', status: 'active', trigger: 'Status changed', steps: 5, runs: 317, success: 91.7, last: '1 hour ago', lastStatus: 'error' },
  { id: 'wf4', name: 'Daily Rate Refresh', status: 'paused', trigger: 'Schedule · 06:00', steps: 4, runs: 128, success: 100, last: 'Paused', lastStatus: 'paused' },
  { id: 'wf5', name: 'Customer Status Webhook', status: 'draft', trigger: 'Not set', steps: 2, runs: 0, success: 0, last: 'Never run', lastStatus: 'draft' },
]

export const HISTORY = [
  { id: '#1045', wf: 'Carrier Tender & Confirm', trigger: 'SHP-48220', status: 'running', dur: '—', steps: '2 / 6', when: 'now' },
  { id: '#1044', wf: 'New Shipment Intake', trigger: 'SHP-48213', status: 'success', dur: '0.79s', steps: '6 / 6', when: 'just now' },
  { id: '#1043', wf: 'New Shipment Intake', trigger: 'SHP-48201', status: 'success', dur: '0.78s', steps: '6 / 6', when: '2 min ago' },
  { id: '#1042', wf: 'Carrier Tender & Confirm', trigger: 'SHP-48199', status: 'success', dur: '0.51s', steps: '6 / 6', when: '12 min ago' },
  { id: '#1041', wf: 'New Shipment Intake', trigger: 'SHP-48180', status: 'error', dur: '0.41s', steps: '3 / 6', when: '1 hour ago' },
  { id: '#1040', wf: 'Exception · Late Pickup', trigger: 'SHP-48177', status: 'error', dur: '0.33s', steps: '2 / 5', when: '1 hour ago' },
  { id: '#1039', wf: 'Carrier Tender & Confirm', trigger: 'SHP-48155', status: 'success', dur: '0.49s', steps: '6 / 6', when: '2 hours ago' },
  { id: '#1038', wf: 'New Shipment Intake', trigger: 'SHP-48140', status: 'success', dur: '0.83s', steps: '6 / 6', when: '3 hours ago' },
  { id: '#1037', wf: 'Daily Rate Refresh', trigger: 'Schedule', status: 'success', dur: '1.24s', steps: '4 / 4', when: '5 hours ago' },
  { id: '#1036', wf: 'Carrier Tender & Confirm', trigger: 'SHP-48101', status: 'success', dur: '0.47s', steps: '6 / 6', when: '6 hours ago' },
]

// ----- version snapshots (immutable published versions + current draft) -----
// node tuple: [id, type, title, x, y, summary]
const v4nodes = [
  ['n_trigger', 'trigger', 'Shipment Booked', 60, 250, 'TMS · Webhook'],
  ['n_enrich', 'enrich', 'Enrich Lane & Rate', 392, 250, 'Lane Intelligence'],
  ['n_cond', 'condition', 'Risk Score Check', 724, 250, 'risk_score > 70'],
  ['n_notify', 'notify', 'Notify Ops Team', 1080, 96, 'Slack · #ops-alerts'],
  ['n_review', 'record', 'Create Review Task', 1412, 96, 'Tasks table'],
  ['n_assign', 'assign', 'Assign Carrier', 1080, 404, 'Preferred pool · max 2.10/mi'],
  ['n_email', 'email', 'Send Tender Email', 1412, 404, 'Email · Carrier'],
  ['n_record', 'record', 'Create Tracking Record', 1744, 404, 'Database · Tracking'],
]
const v4edges = [['n_trigger', 'n_enrich'], ['n_enrich', 'n_cond'], ['n_cond', 'n_notify', 'true'], ['n_cond', 'n_assign', 'false'], ['n_notify', 'n_review'], ['n_assign', 'n_email'], ['n_email', 'n_record']]
const v3nodes = v4nodes.filter((n) => n[0] !== 'n_review').map((n) => (n[0] === 'n_assign' ? ['n_assign', 'assign', 'Assign Carrier', 1080, 404, 'Cheapest · max 2.10/mi'] : n))
const v3edges = v4edges.filter((e) => !(e[0] === 'n_notify' && e[1] === 'n_review'))
const v2nodes = [
  ['n_trigger', 'trigger', 'Shipment Booked', 60, 250, 'TMS · Webhook'],
  ['n_enrich', 'enrich', 'Enrich Lane & Rate', 392, 250, 'Lane Intelligence'],
  ['n_assign', 'assign', 'Assign Carrier', 724, 250, 'Cheapest · all carriers'],
  ['n_email', 'email', 'Send Tender Email', 1056, 250, 'Email · Carrier'],
  ['n_record', 'record', 'Create Tracking Record', 1388, 250, 'Database · Tracking'],
]
const v2edges = [['n_trigger', 'n_enrich'], ['n_enrich', 'n_assign'], ['n_assign', 'n_email'], ['n_email', 'n_record']]
const v1nodes = [
  ['n_trigger', 'trigger', 'Shipment Booked', 60, 250, 'TMS · Webhook'],
  ['n_assign', 'assign', 'Assign Carrier', 392, 250, 'Cheapest · all carriers'],
  ['n_email', 'email', 'Send Tender Email', 724, 250, 'Email · Carrier'],
]
const v1edges = [['n_trigger', 'n_assign'], ['n_assign', 'n_email']]

const mkVer = (def) => ({
  label: def.label, name: def.name, status: def.status, author: def.author, initials: def.initials, avatarBg: def.avatarBg,
  when: def.when, note: def.note, stepsCount: def.nodes.length,
  nodes: def.nodes.map((t) => ({ id: t[0], type: t[1], title: t[2], x: t[3], y: t[4], summary: t[5] })),
  edges: def.edges.map((e, i) => ({ id: def.label + '_e' + i, from: e[0], to: e[1], branch: e[2] })),
})

export const VERSIONS = [
  mkVer({ label: 'v4', name: 'Risk-routed intake', status: 'canary', author: 'You', initials: 'YO', avatarBg: '#0E6EFF', when: '12 min ago', note: 'Route high-risk lanes to ops review; switch carrier matching to the preferred pool.', nodes: v4nodes, edges: v4edges }),
  mkVer({ label: 'v3', name: 'Auto-assign + tracking', status: 'live', author: 'Dana Ruiz', initials: 'DR', avatarBg: '#5560D8', when: '4 days ago', note: 'Cheapest-carrier auto-assignment with tracking record creation.', nodes: v3nodes, edges: v3edges }),
  mkVer({ label: 'v2', name: 'Lane enrichment added', status: 'archived', author: 'Dana Ruiz', initials: 'DR', avatarBg: '#5560D8', when: '3 weeks ago', note: 'Added lane & rate enrichment ahead of carrier assignment.', nodes: v2nodes, edges: v2edges }),
  mkVer({ label: 'v1', name: 'Initial intake', status: 'archived', author: 'Marcus Hale', initials: 'MH', avatarBg: '#00A368', when: '2 months ago', note: 'First published version — straight-through tender.', nodes: v1nodes, edges: v1edges }),
]

export const INITIAL_NODES = [
  { id: 'n_trigger', slug: 'shipment_booked', type: 'trigger', title: 'Shipment Booked', sub: 'TMS · Webhook', x: 60, y: 250, configured: true, config: { event: 'Shipment Booked', source: 'TMS', filter: 'mode = FTL' } },
  { id: 'n_enrich', slug: 'enrich_lane_rate', type: 'enrich', title: 'Enrich Lane & Rate', sub: 'Lane Intelligence', x: 392, y: 250, configured: true, config: { dataset: 'Lane Intelligence', fields: 'miles, transit_days, market_rate', cache: '1 hour' } },
  { id: 'n_cond', slug: 'risk_score_check', type: 'condition', title: 'Risk Score Check', sub: 'risk_score > 70', x: 724, y: 250, configured: true, config: { field: 'risk_score', operator: 'is greater than', value: '70' } },
  { id: 'n_notify', slug: 'notify_ops_team', type: 'notify', title: 'Notify Ops Team', sub: 'Slack · #ops-alerts', x: 1080, y: 96, configured: true, config: { channel: '#ops-alerts', message: 'High-risk lane on {{ shipment_booked.shipment.id }} ({{ enrich_lane_rate.risk_score }}) — needs review.' } },
  { id: 'n_review', slug: 'create_review_task', type: 'record', title: 'Create Review Task', sub: 'Needs setup', x: 1412, y: 96, configured: false, config: { table: '', mapping: '' } },
  { id: 'n_assign', slug: 'assign_carrier', type: 'assign', title: 'Assign Carrier', sub: 'Carrier Match', x: 1080, y: 404, configured: true, config: { strategy: 'Cheapest', pool: 'Preferred carriers', maxRate: '2.10 /mi' } },
  { id: 'n_email', slug: 'send_tender_email', type: 'email', title: 'Send Tender Email', sub: 'Email · Carrier', x: 1412, y: 404, configured: true, config: { to: '{{ assign_carrier.dispatch_email }}', subject: 'Load tender — {{ shipment_booked.shipment.id }}', body: 'Please confirm pickup for {{ shipment_booked.shipment.pickup_date }}.' } },
  { id: 'n_record', slug: 'create_tracking_record', type: 'record', title: 'Create Tracking Record', sub: 'Database · Tracking', x: 1744, y: 404, configured: true, config: { table: 'Tracking', mapping: 'shipment_id, carrier_id, status' } },
]

export const INITIAL_EDGES = [
  { id: 'e1', from: 'n_trigger', to: 'n_enrich' },
  { id: 'e2', from: 'n_enrich', to: 'n_cond' },
  { id: 'e3', from: 'n_cond', to: 'n_notify', branch: 'true' },
  { id: 'e4', from: 'n_cond', to: 'n_assign', branch: 'false' },
  { id: 'e5', from: 'n_notify', to: 'n_review' },
  { id: 'e6', from: 'n_assign', to: 'n_email' },
  { id: 'e7', from: 'n_email', to: 'n_record' },
]

export const SAMPLES = {
  n_trigger: { in: '{\n  "event": "shipment.booked",\n  "source": "TMS"\n}', out: '{\n  "shipment": {\n    "id": "SHP-48213",\n    "lane": "LAX → DFW",\n    "mode": "FTL",\n    "weight_lbs": 38400,\n    "pickup_date": "2026-06-18"\n  }\n}' },
  n_enrich: { in: '{\n  "shipment_id": "SHP-48213",\n  "lane": "LAX → DFW"\n}', out: '{\n  "miles": 1435,\n  "transit_days": 3,\n  "market_rate": 2.04,\n  "risk_score": 41\n}' },
  n_cond: { in: '{\n  "risk_score": 41\n}', out: '{\n  "branch": "false",\n  "matched": "risk_score > 70 → false"\n}' },
  n_assign: { in: '{\n  "lane": "LAX → DFW",\n  "pool": "Preferred carriers",\n  "max_rate": 2.10\n}', out: '{\n  "carrier_id": "CAR-1182",\n  "carrier": "Sunbelt Freight",\n  "dispatch_email": "dispatch@sunbeltfreight.com",\n  "rate": 1.98,\n  "eta": "2026-06-21"\n}' },
  n_email: { in: '{\n  "to": "dispatch@sunbeltfreight.com",\n  "shipment_id": "SHP-48213"\n}', out: '{\n  "message_id": "msg_9f2c41",\n  "status": "sent"\n}' },
  n_record: { in: '{\n  "shipment_id": "SHP-48213",\n  "carrier_id": "CAR-1182"\n}', out: '{\n  "id": "TRK-77410",\n  "status": "created"\n}' },
  n_notify: { in: '{\n  "channel": "#ops-alerts"\n}', out: '{\n  "ts": "1718...",\n  "status": "posted"\n}' },
  n_review: { in: '{}', out: '{}' },
}

// Field schema per node type, used to build the config form.
export const FIELD_DEFS = {
  trigger: [
    { key: 'event', label: 'Trigger event', type: 'select', options: ['Shipment Booked', 'Shipment Updated', 'Shipment Cancelled', 'Status Changed'], required: true },
    { key: 'source', label: 'Source system', type: 'select', options: ['TMS', 'EDI 204', 'Customer Portal', 'API'], required: true },
    { key: 'filter', label: 'Filter (optional)', type: 'text', placeholder: 'e.g. mode = FTL', help: 'Only trigger on shipments matching this expression.' },
  ],
  schedule: [
    { key: 'cadence', label: 'Cadence', type: 'select', options: ['Every hour', 'Every day', 'Every weekday', 'Custom cron'], required: true },
    { key: 'time', label: 'Run at', type: 'text', placeholder: '06:00' },
    { key: 'tz', label: 'Timezone', type: 'select', options: ['America/Chicago', 'America/Los_Angeles', 'UTC'] },
  ],
  http_in: [
    { key: 'method', label: 'Method', type: 'select', options: ['POST', 'GET', 'PUT'], required: true },
    { key: 'path', label: 'Path', type: 'text', placeholder: '/hooks/shipment', help: 'A unique URL will be generated for this path.', required: true },
  ],
  condition: [
    { key: 'field', label: 'Field', type: 'select', options: ['risk_score', 'market_rate', 'miles', 'weight_lbs', 'transit_days'], required: true },
    { key: 'operator', label: 'Operator', type: 'select', options: ['is greater than', 'is less than', 'equals', 'is not', 'contains'], required: true },
    { key: 'value', label: 'Value', type: 'text', placeholder: '70', required: true },
  ],
  filter: [
    { key: 'field', label: 'Field', type: 'select', options: ['risk_score', 'market_rate', 'miles', 'mode'], required: true },
    { key: 'operator', label: 'Operator', type: 'select', options: ['is greater than', 'is less than', 'equals', 'contains'], required: true },
    { key: 'value', label: 'Value', type: 'text', required: true },
  ],
  delay: [
    { key: 'amount', label: 'Wait', type: 'text', placeholder: '5', required: true },
    { key: 'unit', label: 'Unit', type: 'select', options: ['minutes', 'hours', 'days'] },
  ],
  enrich: [
    { key: 'dataset', label: 'Dataset', type: 'select', options: ['Lane Intelligence', 'Rate Index', 'Carrier Scorecard'], required: true },
    { key: 'fields', label: 'Fields to enrich', type: 'text', placeholder: 'miles, transit_days, market_rate', help: 'Comma-separated list of attributes to attach.', required: true },
    { key: 'cache', label: 'Cache results for', type: 'select', options: ['No cache', '1 hour', '24 hours'] },
  ],
  assign: [
    { key: 'strategy', label: 'Matching strategy', type: 'select', options: ['Cheapest', 'Fastest', 'Highest score', 'Preferred first'], required: true },
    { key: 'pool', label: 'Carrier pool', type: 'select', options: ['All carriers', 'Preferred carriers', 'Spot market'], required: true },
    { key: 'maxRate', label: 'Max rate / mi', type: 'text', placeholder: '2.10', help: 'Skip carriers above this rate.' },
  ],
  record: [
    { key: 'table', label: 'Table', type: 'select', options: ['', 'Shipments', 'Tracking', 'Tasks', 'Exceptions'], required: true },
    { key: 'mapping', label: 'Field mapping', type: 'textarea', placeholder: 'shipment_id, carrier_id, status', help: 'One field per line or comma-separated.', required: true },
  ],
  notify: [
    { key: 'channel', label: 'Channel', type: 'text', placeholder: '#ops-alerts', required: true },
    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Type a message, or insert data with { }', required: true },
  ],
  email: [
    { key: 'to', label: 'To', type: 'text', placeholder: 'recipient@example.com', required: true },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Email subject line', required: true },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Write the email body, or insert data with { }', required: true },
  ],
}

// Output field hints per node, surfaced in the Data tab + token autocomplete.
export const OUTPUT_FIELDS = {
  trigger: [
    { path: 'shipment.id', sample: 'SHP-48213' },
    { path: 'shipment.lane', sample: 'LAX → DFW' },
    { path: 'shipment.mode', sample: 'FTL' },
    { path: 'shipment.pickup_date', sample: '2026-06-18' },
  ],
  enrich: [
    { path: 'miles', sample: 1435 },
    { path: 'transit_days', sample: 3 },
    { path: 'market_rate', sample: 2.04 },
    { path: 'risk_score', sample: 41 },
  ],
  assign: [
    { path: 'carrier_id', sample: 'CAR-1182' },
    { path: 'carrier', sample: 'Sunbelt Freight' },
    { path: 'dispatch_email', sample: 'dispatch@sunbeltfreight.com' },
    { path: 'rate', sample: 1.98 },
  ],
  email: [
    { path: 'message_id', sample: 'msg_9f2c41' },
    { path: 'status', sample: 'sent' },
  ],
  record: [
    { path: 'id', sample: 'TRK-77410' },
    { path: 'status', sample: 'created' },
  ],
  notify: [
    { path: 'ts', sample: '1718…' },
    { path: 'status', sample: 'posted' },
  ],
  cond: [],
}
