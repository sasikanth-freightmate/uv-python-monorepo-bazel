// Node-type registry client. Fetches the built-in catalog the backend serves at
// GET /api/v1/node-types (ADR-0009) and reshapes it into the lookup tables the
// editor consumes. This replaces the bundled-static node metadata as the source
// of truth; FlowApp keeps the static data (data.js / ui-components NODE_DEFS) as
// a fallback when the registry is unreachable.

import { apiFetch } from './api.js'

// Presentation grouping for the palette: which backend categories sit under each
// heading, and in what order. The node-type *set* and per-type metadata come
// from the backend — only the grouping and headings are a UI concern.
const PALETTE_GROUPS = [
  { title: 'Triggers', cats: ['trigger'] },
  { title: 'Logic', cats: ['logic'] },
  { title: 'Freight actions', cats: ['data', 'action'] },
  { title: 'Communication', cats: ['comm'] },
]

// Stable display order within a group; types not listed fall to the end in
// backend order.
const TYPE_ORDER = [
  'trigger', 'schedule', 'http_in',
  'condition', 'filter', 'delay',
  'enrich', 'assign', 'record',
  'notify', 'email',
]

// No trailing slash: the route is served at /api/v1/node-types and Next.js
// strips trailing slashes before proxying, so a "/node-types/" call would hit a
// 307 redirect to the absolute backend URL (bypassing the same-origin proxy).
/** Fetch the built-in node-type catalog from the backend registry. */
export function fetchNodeTypes() {
  return apiFetch('/node-types')
}

/**
 * Reshape backend manifests into the lookup tables FlowApp consumes:
 *  - nodeDefs[type]  = { title, sub, kind, cat }   (was NODE_DEFS)
 *  - fieldDefs[type] = config field list           (was FIELD_DEFS)
 *  - outputs[type]   = [{ path, type }]            (was OUTPUT_FIELDS, sans samples)
 *  - palette         = [{ title, items:[{type,label,desc,kind,cat}] }] (was PALETTE)
 */
export function buildNodeRegistry(manifests) {
  const nodeDefs = {}
  const fieldDefs = {}
  const outputs = {}

  for (const m of manifests) {
    const d = m.display || {}
    nodeDefs[m.type_id] = {
      title: d.title || m.type_id,
      sub: d.subtitle || '',
      kind: d.icon || 'bolt',
      cat: m.category,
    }
    fieldDefs[m.type_id] = (m.config_schema && m.config_schema.fields) || []
    outputs[m.type_id] = (m.output_spec && m.output_spec.fields) || []
  }

  const orderOf = (t) => {
    const i = TYPE_ORDER.indexOf(t)
    return i === -1 ? TYPE_ORDER.length : i
  }
  const palette = PALETTE_GROUPS.map((g) => ({
    title: g.title,
    items: manifests
      .filter((m) => g.cats.includes(m.category))
      .sort((a, b) => orderOf(a.type_id) - orderOf(b.type_id))
      .map((m) => {
        const d = m.display || {}
        return {
          type: m.type_id,
          label: d.title || m.type_id,
          desc: d.description || '',
          kind: d.icon || 'bolt',
          cat: m.category,
        }
      }),
  })).filter((g) => g.items.length)

  return { nodeDefs, fieldDefs, outputs, palette }
}
