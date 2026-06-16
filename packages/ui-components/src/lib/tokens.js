// FM Flow design tokens — sampled from freightmate.ai and the design spec.
// Exact hex values are preserved so the UI stays pixel-faithful to the prototype.

export const PALETTE = {
  signalBlue: '#0E6EFF',
  signalBlueHover: '#0A5CDB',
  midnight: '#000029',
  periwinkle: '#7979DD',
  ink: '#181B22',
  canvas: '#F4F5F7',
  railDark: '#0E1116',
  success: '#10905C',
  successBright: '#22C277',
  error: '#E5484D',
  errorDeep: '#CC3338',
  warn: '#DD8400',
  warnDeep: '#B07A00',
}

// Node category → accent colour + soft chip background.
export const NODE_CATEGORIES = {
  trigger: { c: '#0E6EFF', bg: '#EAF2FF' },
  logic: { c: '#6E6BE8', bg: '#EFEEFC' },
  action: { c: '#00A368', bg: '#E2F6EC' },
  data: { c: '#5560D8', bg: '#ECEDFC' },
  comm: { c: '#DD8400', bg: '#FCF1DD' },
}

// Per node-type metadata: default title, summary, icon kind, category.
export const NODE_DEFS = {
  trigger: { title: 'Shipment Booked', sub: 'TMS · Webhook', kind: 'bolt', cat: 'trigger' },
  schedule: { title: 'Schedule', sub: 'Every day · 06:00', kind: 'clock', cat: 'trigger' },
  http_in: { title: 'Incoming Webhook', sub: 'HTTP · POST', kind: 'globe', cat: 'trigger' },
  condition: { title: 'Condition', sub: 'If / else', kind: 'branch', cat: 'logic' },
  filter: { title: 'Filter', sub: 'Continue if…', kind: 'filter', cat: 'logic' },
  delay: { title: 'Delay', sub: 'Wait 5 min', kind: 'clock', cat: 'logic' },
  enrich: { title: 'Enrich Lane & Rate', sub: 'Lane Intelligence', kind: 'search', cat: 'data' },
  assign: { title: 'Assign Carrier', sub: 'Carrier Match', kind: 'truck', cat: 'action' },
  record: { title: 'Create Record', sub: 'Database', kind: 'db', cat: 'data' },
  notify: { title: 'Notify Team', sub: 'Slack', kind: 'bell', cat: 'comm' },
  email: { title: 'Send Email', sub: 'Email', kind: 'mail', cat: 'comm' },
}

export const TYPE_LABELS = {
  trigger: 'Trigger · Shipment event',
  schedule: 'Trigger · Schedule',
  http_in: 'Trigger · Webhook',
  condition: 'Logic · Condition',
  filter: 'Logic · Filter',
  delay: 'Logic · Delay',
  enrich: 'Action · Data enrichment',
  assign: 'Action · Carrier assignment',
  record: 'Action · Create record',
  notify: 'Action · Notification',
  email: 'Action · Email',
}

// Status pill palettes keyed by domain.
export const WORKFLOW_STATUS = {
  active: { label: 'Active', c: '#10905C', bg: '#E3F6EC' },
  paused: { label: 'Paused', c: '#B07A00', bg: '#FCF1DD' },
  draft: { label: 'Draft', c: '#8A919C', bg: '#F1F2F4' },
}

export const RUN_STATUS = {
  success: { label: 'Success', c: '#10905C', bg: '#E3F6EC' },
  error: { label: 'Failed', c: '#CC3338', bg: '#FBE5E6' },
  running: { label: 'Running', c: '#0E6EFF', bg: '#E5F0FF' },
  waiting: { label: 'Waiting', c: '#B07A00', bg: '#FCF1DD' },
}

export const RUN_STEP_STATUS = {
  ok: { bd: '#BCE3CF', badgeBg: '#E3F6EC', badgeC: '#10905C', ft: '#10905C', ftBg: '#F4FBF7', ftBorder: '#E2F0E8', label: 'Completed' },
  error: { bd: '#F2C9CA', badgeBg: '#FBE5E6', badgeC: '#CC3338', ft: '#CC3338', ftBg: '#FDF3F3', ftBorder: '#F4DEDF', label: 'Failed' },
  running: { bd: '#9FC4FF', badgeBg: '#E5F0FF', badgeC: '#0E6EFF', ft: '#0E6EFF', ftBg: '#F2F7FF', ftBorder: '#DCEAFF', label: 'Running' },
  skip: { bd: '#E4E7EC', badgeBg: '#F1F2F4', badgeC: '#A0A6B0', ft: '#A0A6B0', ftBg: '#FAFAFB', ftBorder: '#EEF0F2', label: 'Skipped' },
}

export const VERSION_STATUS = {
  live: { label: 'Live', c: '#10905C', bg: '#E3F6EC' },
  canary: { label: 'Canary', c: '#0E6EFF', bg: '#EAF2FF' },
  archived: { label: 'Archived', c: '#8A919C', bg: '#F1F2F4' },
  draft: { label: 'Draft', c: '#B07A00', bg: '#FCF1DD' },
}

export const CONNECTION_STATUS = {
  connected: { label: 'Connected', c: '#10905C', bg: '#E3F6EC', dot: '#22C277' },
  error: { label: 'Action needed', c: '#CC3338', bg: '#FBE5E6', dot: '#E5484D' },
  available: { label: 'Available', c: '#8A919C', bg: '#F1F2F4', dot: '#C6CBD3' },
}

// Diff overlay palette for the version-compare canvas.
export const DIFF_STATUS = {
  added: { bd: '#9FD8B8', bg: '#F2FBF6', rc: '#10905C', rbg: '#E3F6EC', tag: 'Added', edge: '#7CC9A1' },
  removed: { bd: '#EEC2C3', bg: '#FCF3F3', rc: '#CC3338', rbg: '#FBE5E6', tag: 'Removed', edge: '#E8AFB0' },
  changed: { bd: '#E8CB94', bg: '#FFFBF1', rc: '#B07A00', rbg: '#FCF1DD', tag: 'Changed', edge: '#D3D8DF' },
  same: { bd: '#E4E7EC', bg: '#FFFFFF', rc: null, edge: '#D3D8DF' },
  view: { bd: '#E4E7EC', bg: '#FFFFFF', rc: null, edge: '#C9CFD8' },
}

export const NODE_W = 252

// Geometry helpers shared by every canvas (editor, run, versions).
export function outPort(n, branch) {
  const x = n.x + NODE_W
  let y
  if (n.type === 'condition') y = n.y + (branch === 'true' ? 76 : 106)
  else y = n.y + 33
  return { x, y }
}

export function inPort(n) {
  return { x: n.x, y: n.y + 33 }
}

/** Cubic bezier edge path between two points, flowing left→right. */
export function edgePath(sx, sy, tx, ty) {
  const dx = Math.max(50, Math.abs(tx - sx) * 0.45)
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`
}
