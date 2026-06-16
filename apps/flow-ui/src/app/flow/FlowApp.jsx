'use client'
import { Component, createRef } from 'react'
import {
  AppRail, WorkflowTopBar, PageTopBar, Toast,
  DashboardScreen, EditorScreen, RunDetailScreen, HistoryScreen,
  ConnectionsScreen, TemplatesScreen, VersionsScreen,
  Icon, Glyph,
  NODE_CATEGORIES, NODE_DEFS, TYPE_LABELS, NODE_W,
  WORKFLOW_STATUS, RUN_STATUS, RUN_STEP_STATUS, VERSION_STATUS, CONNECTION_STATUS, DIFF_STATUS,
  outPort, inPort, edgePath,
} from '@fm-flow/ui-components'
import {
  PALETTE, WORKFLOWS, HISTORY, VERSIONS, INITIAL_NODES, INITIAL_EDGES, SAMPLES,
  FIELD_DEFS, OUTPUT_FIELDS,
} from './data.js'

const { Grid, Flow, Template, HistoryGlyph, Versions, Plug, Bolt, Play, Check, Alert, TrendUp } = Glyph

// FlowApp — the single stateful orchestrator. It owns the entire workflow-builder
// state and builds plain-data view-models for the presentational screens in
// @fm-flow/ui-components. Mirrors the prototype's one-Component architecture.
export default class FlowApp extends Component {
  constructor(props) {
    super(props)
    this.state = {
      view: 'editor',
      wfName: 'New Shipment Intake',
      wfStatus: 'active',
      wfRowStatus: {},
      verTab: 'timeline', verSelected: 'v4', cmpA: 'v3', cmpB: 'v4',
      canarySplit: 15, canaryState: 'running',
      paletteQuery: '',
      histFilter: 'all', histQuery: '',
      selectedId: 'n_trigger',
      pan: { x: 60, y: 30 }, zoom: 0.82,
      drag: null, panning: null, connect: null,
      tab: 'settings',
      insertEdge: null,
      run: null, runStatus: 'idle',
      runs: [],
      activeRunId: null, selectedStep: 'n_trigger',
      runPan: { x: 40, y: -70 }, runZoom: 0.74, runPanning: null,
      toast: null,
      nodes: INITIAL_NODES,
      edges: INITIAL_EDGES,
    }
    this.viewportRef = createRef()
    this.runViewportRef = createRef()
    this._onMove = this._onMove.bind(this)
    this._onUp = this._onUp.bind(this)
    this._onKey = this._onKey.bind(this)
  }

  componentDidMount() {
    window.addEventListener('mousemove', this._onMove)
    window.addEventListener('mouseup', this._onUp)
    window.addEventListener('keydown', this._onKey)
    this.seedRuns()
    requestAnimationFrame(() => { if (this.state.view === 'editor' && this.viewportRef.current) this.fit() })
  }
  componentWillUnmount() {
    window.removeEventListener('mousemove', this._onMove)
    window.removeEventListener('mouseup', this._onUp)
    window.removeEventListener('keydown', this._onKey)
    if (this._timer) clearTimeout(this._timer)
  }

  // ---------- geometry ----------
  nodeById(id) { return this.state.nodes.find((n) => n.id === id) }
  nodeHeight(n) { return n.type === 'condition' ? 120 : 90 }
  canvasPoint(e, ref, pan, zoom) {
    const el = ref.current; if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom }
  }

  // ---------- pointer handlers ----------
  onCanvasMouseDown(e) {
    this.setState({ panning: { sx: e.clientX, sy: e.clientY, px: this.state.pan.x, py: this.state.pan.y }, selectedId: null })
  }
  onRunPanDown(e) {
    this.setState({ runPanning: { sx: e.clientX, sy: e.clientY, px: this.state.runPan.x, py: this.state.runPan.y } })
  }
  startNodeDrag(e, id) {
    e.stopPropagation()
    const n = this.nodeById(id)
    this.setState({ selectedId: id, drag: { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false } })
  }
  startConnect(e, fromId, branch) {
    e.stopPropagation()
    const n = this.nodeById(fromId)
    const p = outPort(n, branch)
    this.setState({ connect: { from: fromId, branch: branch || null, x: p.x, y: p.y, sx: p.x, sy: p.y } })
  }
  finishConnect(toId) {
    const c = this.state.connect; if (!c) return
    if (c.from === toId) { this.setState({ connect: null }); return }
    const exists = this.state.edges.some((ed) => ed.from === c.from && ed.to === toId && (ed.branch || null) === (c.branch || null))
    if (exists) { this.setState({ connect: null }); return }
    const edges = this.state.edges.concat([{ id: 'e' + Date.now(), from: c.from, to: toId, branch: c.branch || undefined }])
    this.setState({ edges, connect: null, toast: 'Connected' })
    this.flashToast()
  }
  _onMove(e) {
    const s = this.state
    if (s.drag) {
      const dx = (e.clientX - s.drag.sx) / s.zoom
      const dy = (e.clientY - s.drag.sy) / s.zoom
      if (Math.abs(e.clientX - s.drag.sx) + Math.abs(e.clientY - s.drag.sy) > 3) s.drag.moved = true
      const nodes = s.nodes.map((n) => (n.id === s.drag.id ? { ...n, x: s.drag.ox + dx, y: s.drag.oy + dy } : n))
      this.setState({ nodes })
    } else if (s.panning) {
      this.setState({ pan: { x: s.panning.px + (e.clientX - s.panning.sx), y: s.panning.py + (e.clientY - s.panning.sy) } })
    } else if (s.runPanning) {
      this.setState({ runPan: { x: s.runPanning.px + (e.clientX - s.runPanning.sx), y: s.runPanning.py + (e.clientY - s.runPanning.sy) } })
    } else if (s.connect) {
      const p = this.canvasPoint(e, this.viewportRef, s.pan, s.zoom)
      this.setState({ connect: { ...s.connect, x: p.x, y: p.y } })
    }
  }
  _onUp() {
    if (this.state.connect) this.setState({ connect: null })
    if (this.state.drag || this.state.panning || this.state.runPanning) this.setState({ drag: null, panning: null, runPanning: null })
  }
  _onKey(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedId && this.state.view === 'editor') {
      const t = e.target.tagName
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable) return
      e.preventDefault(); this.deleteNode(this.state.selectedId)
    }
    if (e.key === 'Escape') this.setState({ selectedId: null, connect: null })
  }
  onWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const z = Math.min(1.5, Math.max(0.4, this.state.zoom - e.deltaY * 0.0015))
      this.setState({ zoom: z })
    } else {
      this.setState({ pan: { x: this.state.pan.x - e.deltaX, y: this.state.pan.y - e.deltaY } })
    }
  }

  // ---------- slugs & data references ----------
  slugify(str) { return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node' }
  makeSlug(title) {
    const base = this.slugify(title)
    const taken = new Set(this.state.nodes.map((n) => n.slug).filter(Boolean))
    if (!taken.has(base)) return base
    let i = 2; while (taken.has(base + '_' + i)) i++; return base + '_' + i
  }
  nodeBySlug(slug) { return this.state.nodes.find((n) => n.slug === slug) }
  ancestorsOf(id) {
    const res = new Set(); const stack = [id]
    while (stack.length) {
      const cur = stack.pop()
      this.state.edges.forEach((e) => { if (e.to === cur && !res.has(e.from)) { res.add(e.from); stack.push(e.from) } })
    }
    return res
  }
  outputFieldsFor(node) { return OUTPUT_FIELDS[node.type === 'condition' ? 'cond' : node.type] || [] }
  tokensIn(str) {
    const re = /\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]+)\s*\}\}/g; const out = []; let m
    while ((m = re.exec(String(str || '')))) out.push({ raw: m[0], slug: m[1], field: m[2] })
    return out
  }
  resolveToken(slug, field) {
    const n = this.nodeBySlug(slug); if (!n) return undefined
    const sp = SAMPLES[n.id]; if (!sp) return undefined
    let obj; try { obj = JSON.parse(sp.out) } catch (e) { return undefined }
    let cur = obj; for (const seg of field.split('.')) { if (cur == null) return undefined; cur = cur[seg] }
    return cur
  }
  copyText(t, msg) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(t) } catch (e) {}
    this.setState({ toast: msg || 'Copied' }); this.flashToast()
  }

  // ---------- node ops ----------
  newId() { return 'n' + Math.random().toString(36).slice(2, 8) }
  addNode(type, atEdge) {
    const d = NODE_DEFS[type]
    const id = this.newId()
    let x = 200, y = 260
    let edges = this.state.edges.slice()
    if (atEdge) {
      const ed = this.state.edges.find((e) => e.id === atEdge)
      const a = this.nodeById(ed.from), b = this.nodeById(ed.to)
      x = (a.x + b.x) / 2; y = (a.y + b.y) / 2
      edges = edges.filter((e) => e.id !== atEdge)
      edges.push({ id: 'e' + Date.now(), from: ed.from, to: id, branch: ed.branch })
      edges.push({ id: 'e' + (Date.now() + 1), from: id, to: ed.to })
    } else {
      const sel = this.state.selectedId ? this.nodeById(this.state.selectedId) : null
      if (sel) {
        x = sel.x + 332; y = sel.y
        if (sel.type !== 'condition') edges.push({ id: 'e' + Date.now(), from: sel.id, to: id })
      } else if (this.state.nodes.length) {
        const last = this.state.nodes[this.state.nodes.length - 1]
        x = last.x + 332; y = last.y
      } else { x = 80; y = 250 }
    }
    const node = { id, slug: this.makeSlug(d.title), type, title: d.title, sub: d.sub, x, y, configured: (type === 'trigger' || type === 'condition' || type === 'delay' || type === 'filter'), config: {} }
    this.setState({ nodes: this.state.nodes.concat([node]), edges, selectedId: id, tab: 'settings', insertEdge: null, toast: 'Added “' + d.title + '”' })
    this.flashToast()
  }
  onPaletteAdd(type) { this.addNode(type, this.state.insertEdge) }
  deleteNode(id) {
    const ins = this.state.edges.filter((e) => e.to === id)
    const outs = this.state.edges.filter((e) => e.from === id)
    let edges = this.state.edges.filter((e) => e.from !== id && e.to !== id)
    if (ins.length && outs.length) {
      ins.forEach((ie) => { outs.forEach((oe) => { edges.push({ id: 'e' + Math.random().toString(36).slice(2, 7), from: ie.from, to: oe.to, branch: ie.branch }) }) })
    }
    const nodes = this.state.nodes.filter((n) => n.id !== id)
    this.setState({ nodes, edges, selectedId: null, toast: 'Step deleted' })
    this.flashToast()
  }
  updateConfig(id, key, val) {
    const nodes = this.state.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: val } } : n))
    this.setState({ nodes })
  }
  saveConfig(id) {
    const nodes = this.state.nodes.map((n) => (n.id === id ? { ...n, configured: true, sub: NODE_DEFS[n.type].sub } : n))
    this.setState({ nodes, toast: 'Step configured' }); this.flashToast()
  }
  renameNode(id, v) {
    const nodes = this.state.nodes.map((n) => (n.id === id ? { ...n, title: v } : n))
    this.setState({ nodes })
  }

  // ---------- zoom / fit ----------
  setZoom(z) { this.setState({ zoom: Math.min(1.5, Math.max(0.4, z)) }) }
  fit() {
    const ns = this.state.nodes
    const vp = this.viewportRef.current
    if (!ns.length || !vp) { this.setState({ zoom: 0.7, pan: { x: 30, y: 60 } }); return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    ns.forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + this.nodeHeight(n))
    })
    const gw = maxX - minX, gh = maxY - minY
    const r = vp.getBoundingClientRect()
    const pad = 64
    // Floor low enough that a wide graph still fits a narrow canvas (e.g. when
    // the config panel is open) instead of clamping and overflowing the edge.
    const zoom = Math.min(1.2, Math.max(0.2, Math.min((r.width - pad * 2) / gw, (r.height - pad * 2) / gh)))
    const panX = (r.width - gw * zoom) / 2 - minX * zoom
    const panY = (r.height - gh * zoom) / 2 - minY * zoom
    this.setState({ zoom, pan: { x: panX, y: panY } })
  }

  // ---------- run simulation ----------
  activeRun() { return this.state.runs.find((r) => r.id === this.state.activeRunId) || this.state.runs[0] }
  seedRuns() {
    const okSteps = () => ({
      n_trigger: { st: 'ok', ms: 42 }, n_enrich: { st: 'ok', ms: 318 }, n_cond: { st: 'ok', ms: 11 },
      n_notify: { st: 'skip' }, n_review: { st: 'skip' },
      n_assign: { st: 'ok', ms: 204 }, n_email: { st: 'ok', ms: 156 }, n_record: { st: 'ok', ms: 64 },
    })
    this.setState({
      runs: [
        { id: '#1045', status: 'running', when: 'started 6s ago', dur: '0:06', stepsLabel: '2 / 6', steps: { n_trigger: { st: 'ok', ms: 40 }, n_enrich: { st: 'ok', ms: 296 }, n_cond: { st: 'running' }, n_notify: { st: 'skip' }, n_review: { st: 'skip' }, n_assign: { st: 'pending' }, n_email: { st: 'pending' }, n_record: { st: 'pending' } } },
        { id: '#1043', status: 'success', when: '2 minutes ago', dur: '0.78s', stepsLabel: '6 / 6', steps: okSteps() },
        { id: '#1041', status: 'error', when: '1 hour ago', dur: '0.41s', stepsLabel: '3 / 6', steps: { n_trigger: { st: 'ok', ms: 38 }, n_enrich: { st: 'ok', ms: 288 }, n_cond: { st: 'ok', ms: 9 }, n_notify: { st: 'skip' }, n_review: { st: 'skip' }, n_assign: { st: 'error', ms: 160, error: 'NoCarrierAvailable', errorMsg: 'No carriers in “Preferred carriers” pool serve lane LAX → DFW under 2.10/mi. Widen the pool or raise the max rate.' }, n_email: { st: 'skip' }, n_record: { st: 'skip' } } },
        { id: '#1038', status: 'success', when: '3 hours ago', dur: '0.83s', stepsLabel: '6 / 6', steps: okSteps() },
      ],
      activeRunId: '#1043', selectedStep: 'n_assign',
    })
  }
  runWorkflow() {
    if (this.state.runStatus === 'running') return
    const order = ['n_trigger', 'n_enrich', 'n_cond', 'n_assign', 'n_email', 'n_record']
    const present = order.filter((id) => this.nodeById(id))
    const steps = {}
    this.state.nodes.forEach((n) => { steps[n.id] = { st: 'pending' } })
    ;['n_notify', 'n_review'].forEach((id) => { if (steps[id]) steps[id] = { st: 'skip' } })
    this.setState({ runStatus: 'running', run: { steps, idx: -1 } })
    let i = 0
    const tick = () => {
      if (i >= present.length) { this.setState({ runStatus: 'success' }); return }
      const id = present[i]
      const steps2 = { ...this.state.run.steps }
      steps2[id] = { st: 'running' }
      this.setState({ run: { steps: steps2, idx: i } })
      this._timer = setTimeout(() => {
        const steps3 = { ...this.state.run.steps }
        const ms = [42, 318, 11, 204, 156, 64][i] || 80
        steps3[id] = { st: 'ok', ms }
        this.setState({ run: { steps: steps3, idx: i } })
        i++; this._timer = setTimeout(tick, 180)
      }, 520)
    }
    tick()
  }
  openRun() {
    const liveSteps = { n_trigger: { st: 'ok', ms: 42 }, n_enrich: { st: 'ok', ms: 318 }, n_cond: { st: 'ok', ms: 11 }, n_notify: { st: 'skip' }, n_review: { st: 'skip' }, n_assign: { st: 'ok', ms: 204 }, n_email: { st: 'ok', ms: 156 }, n_record: { st: 'ok', ms: 64 } }
    const newRun = { id: '#1044', status: 'success', when: 'just now', dur: '0.79s', stepsLabel: '6 / 6', steps: liveSteps }
    const runs = [newRun].concat(this.state.runs.filter((r) => r.id !== '#1044'))
    this.setState({ runs, view: 'run', activeRunId: '#1044', selectedStep: 'n_trigger', runStatus: 'idle', run: null })
  }
  flashToast() {
    if (this._toastT) clearTimeout(this._toastT)
    this._toastT = setTimeout(() => this.setState({ toast: null }), 1900)
  }

  // ---------- lifecycle: pause / resume / run controls ----------
  pauseWorkflow() {
    const runs = this.state.runs.map((r) => (r.status === 'running' ? { ...r, status: 'error', when: 'just now', dur: '—', cancelled: true } : r))
    this.setState({ wfStatus: 'paused', runs, runStatus: this.state.runStatus === 'running' ? 'idle' : this.state.runStatus, run: null, toast: 'Workflow paused — all runs stopped' })
    if (this._timer) clearTimeout(this._timer)
    this.flashToast()
  }
  resumeWorkflow() { this.setState({ wfStatus: 'active', toast: 'Workflow resumed — trigger live' }); this.flashToast() }
  toggleWorkflowStatus() { if (this.state.wfStatus === 'active') this.pauseWorkflow(); else this.resumeWorkflow() }
  cancelRun(id) {
    const runs = this.state.runs.map((r) => (r.id === id ? { ...r, status: 'error', cancelled: true, when: 'just now', dur: '0.30s' } : r))
    this.setState({ runs, toast: 'Run ' + id + ' cancelled' }); this.flashToast()
  }
  retryFromFailed(id) {
    this.setState({ view: 'editor', toast: 'Retrying ' + id + ' from failed step…' }); this.flashToast()
    setTimeout(() => this.runWorkflow(), 60)
  }

  // ---------- versions ----------
  versionByLabel(label) { return VERSIONS.find((v) => v.label === label) || VERSIONS[0] }
  diffVersions(aLabel, bLabel) {
    const a = this.versionByLabel(aLabel), b = this.versionByLabel(bLabel)
    const am = {}; a.nodes.forEach((n) => (am[n.id] = n))
    const bm = {}; b.nodes.forEach((n) => (bm[n.id] = n))
    const status = {}
    Object.keys(bm).forEach((id) => { status[id] = am[id] ? (am[id].summary !== bm[id].summary || am[id].title !== bm[id].title ? 'changed' : 'same') : 'added' })
    Object.keys(am).forEach((id) => { if (!bm[id]) status[id] = 'removed' })
    const changes = []
    Object.keys(bm).forEach((id) => {
      if (status[id] === 'added') changes.push({ kind: 'added', title: bm[id].title, detail: bm[id].summary })
      else if (status[id] === 'changed') changes.push({ kind: 'changed', title: bm[id].title, detail: (am[id].summary || '') + '  →  ' + bm[id].summary })
    })
    Object.keys(am).forEach((id) => { if (status[id] === 'removed') changes.push({ kind: 'removed', title: am[id].title, detail: am[id].summary }) })
    return { a, b, status, changes }
  }
  restoreVersion(label) { this.setState({ toast: 'Restored ' + label + ' as a new draft', view: 'editor' }); this.flashToast() }
  promoteCanary() { this.setState({ canaryState: 'promoted', toast: 'v4 promoted to live · 100% of traffic' }); this.flashToast() }
  rollbackCanary() { this.setState({ canaryState: 'rolledback', toast: 'Canary rolled back · v3 serving 100%' }); this.flashToast() }
  setCanarySplit(v) { this.setState({ canarySplit: v }) }

  // ===========================================================================
  // View-model construction — turns state into plain data for the screens.
  buildViewModels() {
    const s = this.state
    const isEditor = s.view === 'editor'
    const isRun = s.view === 'run'
    const showPageBar = ['dashboard', 'history', 'connections', 'templates', 'versions'].includes(s.view)
    const liveSteps = s.run ? s.run.steps : null

    // ----- nav rail -----
    const navDef = [
      { key: 'dashboard', view: 'dashboard', label: 'Dashboard', icon: Grid, active: s.view === 'dashboard' },
      { key: 'editor', view: 'editor', label: 'Editor', icon: Flow, active: isEditor || isRun },
      { key: 'templates', view: 'templates', label: 'Templates', icon: Template, active: s.view === 'templates' },
      { key: 'history', view: 'history', label: 'Run history', icon: HistoryGlyph, active: s.view === 'history' },
      { key: 'versions', view: 'versions', label: 'Versions', icon: Versions, active: s.view === 'versions' },
      { key: 'connections', view: 'connections', label: 'Connections', icon: Plug, active: s.view === 'connections' },
    ]
    const navItems = navDef.map((n) => ({
      key: n.key, label: n.label, active: n.active, icon: n.icon,
      onClick: () => { this.setState({ view: n.view, selectedId: n.view === 'editor' ? s.selectedId : null }) },
    }))

    return {
      showPageBar,
      navItems,
      topBarVM: this.topBarVM(isRun),
      pageBarVM: this.pageBarVM(),
      dashVM: this.dashVM(),
      histVM: this.histVM(),
      connVM: this.connVM(),
      tplVM: this.tplVM(),
      editorVM: this.editorVM(liveSteps),
      runVM: isRun ? this.runVM() : null,
      verVM: this.verVM(),
    }
  }

  topBarVM(isRun) {
    const s = this.state
    return {
      wfName: s.wfName, isRun, paused: s.wfStatus === 'paused', running: s.runStatus === 'running',
      onRenameWf: (e) => this.setState({ wfName: e.target.value }),
      onToggleView: () => this.setState({ view: isRun ? 'editor' : 'run' }),
      onVersions: () => this.setState({ view: 'versions', verTab: 'timeline' }),
      onPause: () => this.toggleWorkflowStatus(),
      onSave: () => { this.setState({ toast: 'Workflow saved' }); this.flashToast() },
      onRun: () => this.runWorkflow(),
    }
  }

  pageBarVM() {
    const s = this.state
    const onNew = () => this.setState({ view: 'templates' })
    if (s.view === 'dashboard') return { title: 'Dashboard', subtitle: 'Automation overview across FreightMate', actionLabel: 'New workflow', actionVariant: 'primary', onAction: onNew }
    if (s.view === 'history') return { title: 'Run history', subtitle: HISTORY.length + ' executions · last 6 hours', actionLabel: 'Export CSV', actionVariant: 'outline', onAction: () => { this.setState({ toast: 'Export started' }); this.flashToast() } }
    if (s.view === 'connections') return { title: 'Connections', subtitle: 'Integrations powering your workflows', actionLabel: 'Browse catalog', actionVariant: 'outline', onAction: () => { this.setState({ toast: 'Opening catalog' }); this.flashToast() } }
    if (s.view === 'versions') return { title: 'Versions', subtitle: '“' + s.wfName + '” · version history, diff & canary', actionLabel: 'Restore a version', actionVariant: 'outline', onAction: () => this.setState({ verTab: 'timeline' }) }
    return { title: 'Templates', subtitle: 'Start from a proven freight automation', actionLabel: 'Blank workflow', actionVariant: 'primary', onAction: () => { this.setState({ view: 'editor', toast: 'New workflow created' }); this.flashToast() } }
  }

  dashVM() {
    const s = this.state
    const stats = [
      { label: 'Active workflows', value: '3', bg: '#EAF2FF', delta: '+1 this week', good: true, glyph: <Bolt size={16} style={{ color: '#0E6EFF' }} /> },
      { label: 'Runs today', value: '1,284', bg: '#ECEDFC', delta: '+12% vs yesterday', good: true, glyph: <Play size={16} style={{ color: '#5560D8' }} /> },
      { label: 'Success rate', value: '97.3%', bg: '#E2F6EC', delta: '+0.4 pts', good: true, glyph: <Check size={16} style={{ color: '#10905C' }} /> },
      { label: 'Failed · 24h', value: '18', bg: '#FCF1DD', delta: '3 need attention', good: false, glyph: <Alert size={16} style={{ color: '#DD8400' }} /> },
    ]
    const workflows = WORKFLOWS.map((w) => {
      const status = s.wfRowStatus[w.id] || w.status
      return {
        id: w.id, name: w.name, status, trigger: w.trigger, stepsLabel: w.steps + ' steps', lastStatus: w.lastStatus,
        successLabel: w.runs ? w.success + '% success' : 'Not run yet',
        runsLabel: w.runs ? w.runs.toLocaleString() + ' runs' : '—',
        last: status === 'paused' ? 'Paused' : w.last,
        canToggle: status === 'active' || status === 'paused',
        onOpen: () => this.setState({ view: 'editor' }),
        onToggle: (e) => {
          e.stopPropagation()
          const next = status === 'paused' ? 'active' : 'paused'
          this.setState({ wfRowStatus: { ...s.wfRowStatus, [w.id]: next }, toast: next === 'paused' ? '“' + w.name + '” paused — all runs stopped' : '“' + w.name + '” resumed' })
          this.flashToast()
        },
      }
    })
    const activeCount = WORKFLOWS.filter((w) => (s.wfRowStatus[w.id] || w.status) === 'active').length
    return { stats, workflows, wfCountLabel: WORKFLOWS.length + ' workflows · ' + activeCount + ' active', onNewWorkflow: () => this.setState({ view: 'templates' }) }
  }

  histVM() {
    const s = this.state
    const counts = { all: HISTORY.length, success: 0, error: 0, running: 0 }
    HISTORY.forEach((h) => { counts[h.status] = (counts[h.status] || 0) + 1 })
    const fdef = [{ k: 'all', label: 'All' }, { k: 'success', label: 'Success' }, { k: 'error', label: 'Failed' }, { k: 'running', label: 'Running' }]
    const filters = fdef.map((f) => ({ k: f.k, label: f.label, count: counts[f.k] || 0, active: s.histFilter === f.k, onClick: () => this.setState({ histFilter: f.k }) }))
    const hq = s.histQuery.trim().toLowerCase()
    const rows = HISTORY.filter((h) => (s.histFilter === 'all' || h.status === s.histFilter) && (!hq || h.id.toLowerCase().includes(hq) || h.wf.toLowerCase().includes(hq) || h.trigger.toLowerCase().includes(hq)))
      .map((h) => ({ id: h.id, wf: h.wf, trigger: h.trigger, dur: h.dur, steps: h.steps, when: h.when, status: h.status, onClick: () => { const has = s.runs.some((r) => r.id === h.id); this.setState({ view: 'run', activeRunId: has ? h.id : '#1043', selectedStep: 'n_trigger' }) } }))
    return { filters, rows, empty: rows.length === 0, query: s.histQuery, onSearch: (e) => this.setState({ histQuery: e.target.value }) }
  }

  connVM() {
    const stats = [
      { label: 'Active connections', value: '6', bg: '#E2F6EC', glyph: <Check size={20} style={{ color: '#10905C' }} /> },
      { label: 'Needs attention', value: '1', bg: '#FCF1DD', glyph: <Alert size={20} style={{ color: '#DD8400' }} /> },
      { label: 'Workflows powered', value: '21', bg: '#EAF2FF', glyph: <Bolt size={20} style={{ color: '#0E6EFF' }} /> },
    ]
    const defs = [
      { name: 'FreightMate TMS', cat: 'Core platform', status: 'connected', detail: 'org · freightmate-prod', kind: 'branch', color: '#0E6EFF', bg: '#EAF2FF', flows: 9 },
      { name: 'Slack', cat: 'Team notifications', status: 'connected', detail: 'FreightMate Ops · 4 channels', kind: 'bell', color: '#5560D8', bg: '#ECEDFC', flows: 3 },
      { name: 'SendGrid', cat: 'Email delivery', status: 'connected', detail: 'noreply@freightmate.ai', kind: 'mail', color: '#00A368', bg: '#E2F6EC', flows: 4 },
      { name: 'Carrier API Network', cat: 'Carrier connectivity', status: 'connected', detail: '214 carriers · DAT, Truckstop', kind: 'truck', color: '#0E6EFF', bg: '#EAF2FF', flows: 2 },
      { name: 'Tracking Database', cat: 'Data store', status: 'connected', detail: 'Postgres · 3 tables', kind: 'db', color: '#5560D8', bg: '#ECEDFC', flows: 6 },
      { name: 'QuickBooks', cat: 'Accounting sync', status: 'error', detail: 'Token expired 2 days ago', kind: 'filter', color: '#DD8400', bg: '#FCF1DD', flows: 1 },
      { name: 'EDI Gateway', cat: 'Carrier EDI · 204 / 214 / 210', status: 'available', detail: 'Exchange EDI documents with carriers', kind: 'globe', color: '#8A919C', bg: '#F1F2F4', flows: 0 },
      { name: 'Google Sheets', cat: 'Spreadsheets', status: 'available', detail: 'Sync workflow output to a sheet', kind: 'search', color: '#8A919C', bg: '#F1F2F4', flows: 0 },
    ]
    const connections = defs.map((d) => ({
      name: d.name, cat: d.cat, detail: d.detail, kind: d.kind, color: d.color, bg: d.bg, status: d.status,
      flowsLabel: d.status !== 'available' ? d.flows + ' workflow' + (d.flows === 1 ? '' : 's') : 'Not connected',
      btnLabel: d.status === 'error' ? 'Reauthorize' : d.status === 'available' ? 'Connect' : 'Manage',
      onManage: () => { this.setState({ toast: d.status === 'available' ? 'Connecting ' + d.name + '…' : d.status === 'error' ? 'Reauthorizing ' + d.name + '…' : 'Opening ' + d.name }); this.flashToast() },
    }))
    return { stats, connections }
  }

  tplVM() {
    const defs = [
      { name: 'New Shipment Intake', cat: 'Intake', desc: 'Enrich the lane, score risk, then route to ops review or auto-assign a carrier.', steps: 8, popular: true, kind: 'bolt', color: '#0E6EFF', bg: '#EAF2FF' },
      { name: 'Carrier Tender & Confirm', cat: 'Procurement', desc: 'Tender loads to your preferred pool and confirm pickup automatically.', steps: 6, popular: true, kind: 'truck', color: '#00A368', bg: '#E2F6EC' },
      { name: 'Exception · Late Pickup', cat: 'Exceptions', desc: 'Detect missed pickups and escalate to the right team in real time.', steps: 5, kind: 'bell', color: '#DD8400', bg: '#FCF1DD' },
      { name: 'Daily Rate Refresh', cat: 'Pricing', desc: 'Pull market rates each morning and refresh your lane benchmarks.', steps: 4, kind: 'search', color: '#5560D8', bg: '#ECEDFC' },
      { name: 'Detention Watch', cat: 'Exceptions', desc: 'Track dwell time and alert dispatch before detention charges accrue.', steps: 5, kind: 'clock', color: '#DD8400', bg: '#FCF1DD' },
      { name: 'Invoice Reconciliation', cat: 'Billing', desc: 'Match carrier invoices to tenders and flag any rate discrepancies.', steps: 7, kind: 'db', color: '#5560D8', bg: '#ECEDFC' },
      { name: 'Customer Status Webhook', cat: 'Visibility', desc: 'Push milestone updates to customer systems via outbound webhook.', steps: 3, kind: 'globe', color: '#0E6EFF', bg: '#EAF2FF' },
      { name: 'Capacity Digest', cat: 'Reporting', desc: 'Summarize open loads and carrier capacity into a daily Slack post.', steps: 4, kind: 'mail', color: '#00A368', bg: '#E2F6EC' },
    ]
    const templates = defs.map((d) => ({ ...d, popular: !!d.popular, stepsLabel: d.steps + ' steps', onUse: () => { this.setState({ view: 'editor', wfName: d.name, toast: 'Created from “' + d.name + '”' }); this.flashToast() } }))
    return { templates, onScratch: () => { this.setState({ view: 'editor', toast: 'New workflow created' }); this.flashToast() } }
  }

  editorVM(liveSteps) {
    const s = this.state
    const sel = s.selectedId ? this.nodeById(s.selectedId) : null

    const nodes = s.nodes.map((n) => ({
      node: n,
      selected: s.selectedId === n.id,
      dragging: s.drag && s.drag.id === n.id,
      runState: liveSteps ? liveSteps[n.id] : null,
      onCardDown: (e) => this.startNodeDrag(e, n.id),
      onPortDown: (e) => this.startConnect(e, n.id, null),
      onPortUp: () => this.finishConnect(n.id),
      onPortDownTrue: (e) => this.startConnect(e, n.id, 'true'),
      onPortDownFalse: (e) => this.startConnect(e, n.id, 'false'),
    }))

    const edgeColor = (br) => (br === 'true' ? '#9FD3B6' : br === 'false' ? '#C7CCD6' : '#C9CFD8')
    const edges = s.edges.map((ed) => {
      const a = this.nodeById(ed.from), b = this.nodeById(ed.to)
      if (!a || !b) return { id: ed.id, d: '', color: 'transparent', width: 0 }
      const p1 = outPort(a, ed.branch), p2 = inPort(b)
      const rs = liveSteps ? liveSteps[ed.from] : null
      const active = rs && (rs.st === 'ok' || rs.st === 'running')
      return { id: ed.id, d: edgePath(p1.x, p1.y, p2.x, p2.y), color: active ? '#7CC9A1' : edgeColor(ed.branch), width: active ? 2.6 : 2, dash: active && rs.st === 'running' ? '6 6' : '', animated: active && rs.st === 'running' }
    })

    const edgeButtons = s.edges.map((ed) => {
      const a = this.nodeById(ed.from), b = this.nodeById(ed.to)
      if (!a || !b) return null
      const p1 = outPort(a, ed.branch), p2 = inPort(b)
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
      return {
        id: ed.id,
        onClick: (e) => { e.stopPropagation(); this.setState({ insertEdge: ed.id, toast: 'Pick a step to insert' }); this.flashToast() },
        style: { position: 'absolute', left: mx - 11, top: my - 11, width: 22, height: 22, borderRadius: '50%', background: '#fff', border: '1px solid ' + (s.insertEdge === ed.id ? '#0E6EFF' : '#D7DBE2'), color: s.insertEdge === ed.id ? '#0E6EFF' : '#A6ACB6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 4, boxShadow: '0 1px 3px rgba(20,24,32,.12)' },
      }
    }).filter(Boolean)

    let connectPreview = null
    if (s.connect) connectPreview = edgePath(s.connect.sx, s.connect.sy, s.connect.x, s.connect.y)

    // palette
    const q = s.paletteQuery.trim().toLowerCase()
    const groups = PALETTE.map((g) => ({
      title: g.title,
      items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)).map((it) => {
        const cat = NODE_CATEGORIES[it.cat]
        return { type: it.type, label: it.label, desc: it.desc, kind: it.kind, color: cat.c, bg: cat.bg, onAdd: () => this.onPaletteAdd(it.type), onDragStart: (e) => e.dataTransfer.setData('text/type', it.type) }
      }),
    })).filter((g) => g.items.length)

    return {
      palette: { hint: s.insertEdge ? 'Choose a step to insert into the connection.' : 'Click or drag a step onto the canvas.', query: s.paletteQuery, onSearch: (e) => this.setState({ paletteQuery: e.target.value }), groups },
      canvas: {
        nodes, edges, edgeButtons, connectPreview, showEmpty: s.nodes.length === 0,
        viewportRef: this.viewportRef,
        viewportStyle: { backgroundImage: 'radial-gradient(#C7CCD4 1.2px, transparent 1.2px)', backgroundSize: `${24 * s.zoom}px ${24 * s.zoom}px`, backgroundPosition: `${s.pan.x}px ${s.pan.y}px`, cursor: s.panning ? 'grabbing' : 'default' },
        canvasStyle: { position: 'absolute', top: 0, left: 0, width: 5000, height: 3200, transform: `translate(${s.pan.x}px, ${s.pan.y}px) scale(${s.zoom})`, transformOrigin: '0 0' },
        zoomPct: Math.round(s.zoom * 100) + '%',
        onZoomIn: () => this.setZoom(s.zoom + 0.1), onZoomOut: () => this.setZoom(s.zoom - 0.1), onZoomReset: () => this.setState({ zoom: 0.82 }), onFit: () => this.fit(),
        onCanvasMouseDown: (e) => { if (e.target === this.viewportRef.current || e.currentTarget === e.target) this.onCanvasMouseDown(e); else this.setState({ selectedId: null, panning: { sx: e.clientX, sy: e.clientY, px: s.pan.x, py: s.pan.y } }) },
        onWheel: (e) => this.onWheel(e),
        onCanvasDragOver: (e) => e.preventDefault(),
        onCanvasDrop: (e) => { e.preventDefault(); const t = e.dataTransfer.getData('text/type'); if (t) this.addNode(t, null) },
        onAddTrigger: () => this.addNode('trigger', null),
        showRunBanner: s.runStatus === 'success',
        onOpenRun: () => this.openRun(),
      },
      config: { sel: sel ? this.configVM(sel) : null, onSaveConfig: () => this.saveConfig(s.selectedId) },
    }
  }

  configVM(sel) {
    const s = this.state
    const cat = NODE_CATEGORIES[NODE_DEFS[sel.type].cat]
    const cfg = sel.config || {}
    const slugMap = {}; s.nodes.forEach((n) => { if (n.slug) slugMap[n.slug] = { label: n.title } })
    const ancIds = this.ancestorsOf(sel.id)
    const vars = s.nodes.filter((n) => ancIds.has(n.id)).map((n) => ({ slug: n.slug, label: n.title, fields: this.outputFieldsFor(n) }))
    const fields = (FIELD_DEFS[sel.type] || []).map((f) => ({
      key: f.key, label: f.label, required: !!f.required, type: f.type, options: f.options || [],
      value: cfg[f.key] || '', placeholder: f.placeholder || '', help: f.help || '',
      fieldKey: sel.id + '::' + f.key, vars, slugMap,
      onInput: (e) => this.updateConfig(sel.id, f.key, e.target.value),
      onCommit: (val) => this.updateConfig(sel.id, f.key, val),
    }))
    const outputs = this.outputFieldsFor(sel).map((o) => { const ref = '{{ ' + sel.slug + '.' + o.path + ' }}'; return { path: o.path, sample: String(o.sample), onCopy: () => this.copyText(ref, 'Copied reference') } })
    const samp = SAMPLES[sel.id] || { in: '{}', out: '{}' }
    const tab = s.tab || 'settings'
    return {
      title: sel.title, typeLabel: TYPE_LABELS[sel.type] || 'Step', kind: NODE_DEFS[sel.type].kind, catColor: cat.c, catBg: cat.bg,
      idLabel: sel.slug, needsSetup: !sel.configured, tab,
      tabs: [{ k: 'settings', label: 'Settings' }, { k: 'data', label: 'Data' }].map((t) => ({ k: t.k, label: t.label, active: tab === t.k, onClick: () => this.setState({ tab: t.k }) })),
      fields, slug: sel.slug, onCopySlug: () => this.copyText(sel.slug, 'Copied slug'),
      outputs, hasOutputs: outputs.length > 0, sampleInput: samp.in, sampleOutput: samp.out,
      onRename: (e) => this.renameNode(sel.id, e.target.value),
      onClose: () => this.setState({ selectedId: null }),
      onDelete: () => this.deleteNode(sel.id),
    }
  }

  runVM() {
    const s = this.state
    const ar = this.activeRun()
    const stMap = ar ? ar.steps : {}

    const runNodes = s.nodes.map((n) => {
      const st = stMap[n.id] || { st: 'skip' }
      let trueTaken = false, falseTaken = false
      if (n.type === 'condition') {
        s.edges.forEach((ed) => { if (ed.from === n.id) { const tst = stMap[ed.to]; const taken = !!(tst && tst.st !== 'skip' && tst.st !== 'pending'); if (ed.branch === 'true') trueTaken = trueTaken || taken; else if (ed.branch === 'false') falseTaken = falseTaken || taken } })
      }
      return { node: n, runState: st, selected: s.selectedStep === n.id, isCondition: n.type === 'condition', trueTaken, falseTaken, onSelect: (e) => { e.stopPropagation(); this.setState({ selectedStep: n.id }) } }
    })

    const runEdges = s.edges.map((ed) => {
      const a = this.nodeById(ed.from), b = this.nodeById(ed.to)
      if (!a || !b) return { id: ed.id, d: '', color: 'transparent', width: 0 }
      const p1 = outPort(a, ed.branch), p2 = inPort(b)
      const fst = stMap[ed.from], tst = stMap[ed.to]
      const both = fst && tst && fst.st !== 'skip' && tst.st !== 'skip' && fst.st !== 'error'
      const errEdge = fst && fst.st === 'error'
      return { id: ed.id, d: edgePath(p1.x, p1.y, p2.x, p2.y), color: both ? '#7CC9A1' : errEdge ? '#E8C0C1' : '#DDE0E5', width: both ? 2.6 : 2 }
    })

    const heroPal = ar.status === 'success' ? { bg: '#E3F6EC', c: '#10905C', label: 'Success' } : ar.status === 'error' ? { bg: '#FBE5E6', c: '#CC3338', label: ar.cancelled ? 'Cancelled' : 'Failed' } : { bg: '#E5F0FF', c: '#0E6EFF', label: 'Running' }
    const hero = {
      id: 'Run ' + ar.id, sub: 'Workflow “' + s.wfName + '” · ' + ar.when, status: ar.status, cancelled: ar.cancelled,
      bg: heroPal.bg, c: heroPal.c, label: heroPal.label, duration: ar.dur, steps: ar.stepsLabel,
      isRunning: ar.status === 'running', isFailed: ar.status === 'error' && !ar.cancelled,
      onCancel: () => this.cancelRun(ar.id), onRetryFailed: () => this.retryFromFailed(ar.id),
    }

    const runList = s.runs.map((r) => {
      const pal = RUN_STATUS[r.status] || RUN_STATUS.running
      return { id: 'Run ' + r.id, active: r.id === s.activeRunId, status: r.status, bg: pal.bg, c: pal.c, tag: r.status === 'success' ? 'Success' : r.status === 'error' ? (r.cancelled ? 'Cancelled' : 'Failed') : 'Running', meta: r.when, dur: r.dur, onClick: () => this.setState({ activeRunId: r.id, selectedStep: 'n_trigger' }) }
    })

    return { runCountLabel: s.runs.length + ' total', runNodes, runEdges, hero, runList, onRerun: () => { this.setState({ view: 'editor' }); setTimeout(() => this.runWorkflow(), 60) }, runViewportRef: this.runViewportRef, onRunPanDown: (e) => this.onRunPanDown(e), runCanvasStyle: { position: 'absolute', top: 0, left: 0, width: 5000, height: 3200, transform: `translate(${s.runPan.x}px, ${s.runPan.y}px) scale(${s.runZoom})`, transformOrigin: '0 0' }, step: this.stepVM(stMap) }
  }

  stepVM(stMap) {
    const s = this.state
    const sn = this.nodeById(s.selectedStep)
    if (!sn) return null
    const sst = stMap[s.selectedStep] || { st: 'skip' }
    const cat = NODE_CATEGORIES[NODE_DEFS[sn.type].cat]
    const stPal = ({ ok: { c: '#10905C', bg: '#E3F6EC', label: 'Completed' }, error: { c: '#CC3338', bg: '#FBE5E6', label: 'Failed' }, skip: { c: '#A0A6B0', bg: '#F1F2F4', label: 'Skipped' }, running: { c: '#0E6EFF', bg: '#E5F0FF', label: 'Running' } })[sst.st] || { c: '#A0A6B0', bg: '#F1F2F4', label: 'Skipped' }
    const samp = SAMPLES[sn.id] || { in: '{}', out: '{}' }
    const isErr = sst.st === 'error', isSkip = sst.st === 'skip'

    const refSeen = {}; const refs = []
    Object.keys(sn.config || {}).forEach((k) => {
      this.tokensIn(sn.config[k]).forEach((tk) => {
        if (refSeen[tk.raw]) return; refSeen[tk.raw] = 1
        const src = this.nodeBySlug(tk.slug)
        const val = this.resolveToken(tk.slug, tk.field)
        const ok = !!(src && val !== undefined)
        refs.push({ srcLabel: src ? src.title : tk.slug, field: tk.field, ok, valueLabel: val === undefined ? 'unresolved' : typeof val === 'object' ? JSON.stringify(val) : String(val) })
      })
    })

    const logs = (isErr ? [
      { t: '00.00', msg: 'Step started', style: { color: '#5C6470' } },
      { t: '00.16', msg: 'Querying carrier pool “Preferred carriers”', style: { color: '#5C6470' } },
      { t: '00.16', msg: '✗ ' + sst.error + ': no match found', style: { color: '#CC3338' } },
    ] : isSkip ? [
      { t: '—', msg: 'Not executed — branch not taken', style: { color: '#A0A6B0' } },
    ] : [
      { t: '00.00', msg: 'Step started', style: { color: '#5C6470' } },
      { t: sst.ms ? '00.' + String(Math.min(99, Math.round(sst.ms / 10))).padStart(2, '0') : '00.04', msg: '✓ Completed in ' + (sst.ms || 0) + ' ms', style: { color: '#10905C' } },
    ]).map((l, i) => ({ ...l, bg: i % 2 ? '#FBFBFC' : '#fff' }))

    return {
      title: sn.title, kind: NODE_DEFS[sn.type].kind, catColor: cat.c, catBg: cat.bg,
      statusColor: stPal.c, statusBg: stPal.bg, statusLabel: stPal.label, dur: sst.ms != null ? sst.ms + ' ms' : '—',
      hasError: isErr, errorTitle: sst.error || 'Error', errorMsg: sst.errorMsg || '',
      hasRefs: refs.length > 0, refs,
      input: isSkip ? '—' : samp.in, output: isErr ? 'null' : isSkip ? '—' : samp.out, outputDim: isErr, logs,
    }
  }

  verVM() {
    const s = this.state
    const verSel = this.versionByLabel(s.verSelected)
    const verList = VERSIONS.map((v) => {
      const p = VERSION_STATUS[v.status]
      return {
        label: v.label, name: v.name, note: v.note, when: v.when, author: v.author, initials: v.initials, avatarBg: v.avatarBg,
        statusLabel: p.label, statusColor: p.c, statusBg: p.bg, stepsLabel: v.stepsCount + ' steps',
        active: s.verTab === 'timeline' && v.label === s.verSelected,
        canRestore: v.status !== 'live' && v.status !== 'canary',
        onSelect: () => this.setState({ verTab: 'timeline', verSelected: v.label }),
        onView: (e) => { e.stopPropagation(); this.setState({ verTab: 'timeline', verSelected: v.label, toast: 'Viewing ' + v.label + ' (read-only)' }); this.flashToast() },
        onCompare: (e) => { e.stopPropagation(); this.setState({ verTab: 'compare', cmpA: v.label === 'v4' ? 'v3' : v.label, cmpB: 'v4' }) },
        onRestore: (e) => { e.stopPropagation(); this.restoreVersion(v.label) },
      }
    })

    // canvas nodes/edges depend on tab
    let verNodes = [], verEdges = [], rawNodes = [], bannerText = '', bannerSub = '', bannerTone = 'neutral'
    let changes = [], hasChanges = false, cmpAName = '', cmpBName = ''
    const edgeVM = (lookup, from, to, branch, ds) => {
      const a = lookup[from], b = lookup[to]; if (!a || !b) return null
      const pa = { x: a.x + NODE_W, y: a.y + 37 }, pb = { x: b.x, y: b.y + 37 }
      return { id: from + '>' + to + '>' + (branch || ''), d: edgePath(pa.x, pa.y, pb.x, pb.y), color: DIFF_STATUS[ds || 'view'].edge, width: ds === 'added' ? 2.6 : 2, dash: ds === 'removed' ? '5 6' : '' }
    }
    if (s.verTab === 'compare') {
      const d = this.diffVersions(s.cmpA, s.cmpB)
      cmpAName = d.a.label + ' · ' + d.a.name; cmpBName = d.b.label + ' · ' + d.b.name
      const lookup = {}; d.b.nodes.forEach((n) => (lookup[n.id] = n)); d.a.nodes.forEach((n) => { if (!lookup[n.id]) lookup[n.id] = n })
      rawNodes = Object.keys(lookup).map((k) => lookup[k])
      verNodes = rawNodes.map((n) => ({ node: n, diff: d.status[n.id] || 'same' }))
      const ekey = {}
      d.a.edges.forEach((e) => { ekey[e.from + '>' + e.to + '>' + (e.branch || '')] = { from: e.from, to: e.to, branch: e.branch, inA: true, inB: false } })
      d.b.edges.forEach((e) => { const k = e.from + '>' + e.to + '>' + (e.branch || ''); if (ekey[k]) ekey[k].inB = true; else ekey[k] = { from: e.from, to: e.to, branch: e.branch, inA: false, inB: true } })
      verEdges = Object.keys(ekey).map((k) => { const e = ekey[k]; const ds = e.inA && e.inB ? 'same' : e.inB ? 'added' : 'removed'; return edgeVM(lookup, e.from, e.to, e.branch, ds) }).filter(Boolean)
      changes = d.changes.map((c) => ({ kind: c.kind, title: c.title, detail: c.detail }))
      hasChanges = changes.length > 0
      bannerText = 'Comparing ' + d.a.label + ' → ' + d.b.label; bannerSub = changes.length + ' change' + (changes.length === 1 ? '' : 's'); bannerTone = 'compare'
    } else {
      const lookup = {}; verSel.nodes.forEach((n) => (lookup[n.id] = n))
      rawNodes = verSel.nodes
      verNodes = verSel.nodes.map((n) => ({ node: n, diff: 'view' }))
      verEdges = verSel.edges.map((e) => edgeVM(lookup, e.from, e.to, e.branch, 'view')).filter(Boolean)
      bannerText = verSel.label + ' · ' + verSel.name
      bannerSub = verSel.status === 'live' ? 'Live version · read-only' : verSel.status === 'canary' ? 'Canary draft · read-only' : 'Archived version · read-only'
      bannerTone = verSel.status
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    rawNodes.forEach((n) => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + 82) })

    const cs = s.canaryState
    const headPal = cs === 'running' ? { c: '#0E6EFF', bg: '#EAF2FF', label: 'Running' } : cs === 'promoted' ? { c: '#10905C', bg: '#E3F6EC', label: 'Promoted' } : { c: '#B07A00', bg: '#FCF1DD', label: 'Rolled back' }
    const canary = {
      state: cs, headLabel: headPal.label, headColor: headPal.c, headBg: headPal.bg,
      split: s.canarySplit, liveSplit: 100 - s.canarySplit,
      metrics: [
        { label: 'Success rate', live: '96.1%', cand: '98.7%', delta: '+2.6 pts' },
        { label: 'Avg duration', live: '0.83s', cand: '0.71s', delta: '−0.12s' },
      ],
      sampleLabel: '4,128 runs sampled · 95% confidence',
      onSplit: (e) => this.setCanarySplit(parseInt(e.target.value, 10)),
      onPromote: () => this.promoteCanary(), onRollback: () => this.rollbackCanary(), onReset: () => this.setState({ canaryState: 'running' }),
    }

    return {
      tabs: [{ k: 'timeline', label: 'Timeline' }, { k: 'compare', label: 'Compare' }, { k: 'canary', label: 'Canary' }].map((t) => ({ k: t.k, label: t.label, active: s.verTab === t.k, onClick: () => this.setState({ verTab: t.k }) })),
      isTimeline: s.verTab === 'timeline', isCompare: s.verTab === 'compare', isCanary: s.verTab === 'canary', isCanvas: s.verTab !== 'canary',
      verList, selectedRestorable: verSel.status !== 'live', onRestoreSelected: () => this.restoreVersion(s.verSelected),
      cmpA: s.cmpA, cmpB: s.cmpB, cmpOptions: VERSIONS.map((v) => ({ label: v.label, value: v.label })),
      onCmpA: (e) => this.setState({ cmpA: e.target.value }), onCmpB: (e) => this.setState({ cmpB: e.target.value }),
      verNodes, verEdges, bounds: { minX, minY, maxX, maxY }, fitKey: s.verTab + '|' + s.verSelected + '|' + s.cmpA + '|' + s.cmpB,
      bannerText, bannerSub, bannerTone, changes, hasChanges, cmpAName, cmpBName, canary,
    }
  }

  // ===========================================================================
  render() {
    const vm = this.buildViewModels()
    const s = this.state
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F4F5F7]">
        <AppRail items={vm.navItems} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {(s.view === 'editor' || s.view === 'run') && <WorkflowTopBar vm={vm.topBarVM} />}
          {vm.showPageBar && <PageTopBar {...vm.pageBarVM} />}
          <div className="flex min-h-0 flex-1">
            {s.view === 'editor' && <Pane><EditorScreen vm={vm.editorVM} /></Pane>}
            {s.view === 'run' && <Pane><RunDetailScreen vm={vm.runVM} /></Pane>}
            {s.view === 'dashboard' && <Pane><DashboardScreen vm={vm.dashVM} /></Pane>}
            {s.view === 'history' && <Pane><HistoryScreen vm={vm.histVM} /></Pane>}
            {s.view === 'connections' && <Pane><ConnectionsScreen vm={vm.connVM} /></Pane>}
            {s.view === 'templates' && <Pane><TemplatesScreen vm={vm.tplVM} /></Pane>}
            {s.view === 'versions' && <Pane><VersionsScreen vm={vm.verVM} /></Pane>}
          </div>
        </div>
        <Toast text={s.toast} />
      </div>
    )
  }
}

function Pane({ children }) {
  return <div className="relative flex min-h-0 min-w-0 flex-1">{children}</div>
}
