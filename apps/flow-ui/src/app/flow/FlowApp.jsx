'use client'
import { Component } from 'react'
import {
  AppRail, WorkflowTopBar, PageTopBar, Toast,
  DashboardScreen, EditorScreen, RunDetailScreen, HistoryScreen,
  ConnectionsScreen, TemplatesScreen, VersionsScreen,
  Icon, Glyph,
  NODE_CATEGORIES, NODE_DEFS, TYPE_LABELS, NODE_W,
  WORKFLOW_STATUS, RUN_STATUS, RUN_STEP_STATUS, VERSION_STATUS, CONNECTION_STATUS, DIFF_STATUS,
  toRFNode, toRFEdge, fromRFConnection, layoutLR,
} from '@fm-flow/ui-components'
import {
  PALETTE, WORKFLOWS, HISTORY, VERSIONS, INITIAL_NODES, INITIAL_EDGES, SAMPLES,
  FIELD_DEFS, OUTPUT_FIELDS,
} from './data.js'
import { fetchMe, getActiveOrg, logout, setActiveOrg } from '../../lib/auth.js'
import { buildNodeRegistry, fetchNodeTypes } from '../../lib/nodeTypes.js'

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
      selectedIds: ['n_trigger'], selectedEdgeIds: [],
      zoom: 0.82,
      history: { past: [], future: [] },
      tab: 'settings',
      insertEdge: null,
      run: null, runStatus: 'idle',
      runs: [],
      activeRunId: null, selectedStep: 'n_trigger',
      toast: null,
      nodes: INITIAL_NODES,
      edges: INITIAL_EDGES,
      // Node-type registry fetched from the backend (ADR-0009). null until
      // loaded; the bundled static catalog is used as a fallback meanwhile.
      nodeReg: null,
    }
    this._rf = null            // React Flow instance (editor canvas)
    this._clipboard = null     // copy/paste buffer: { nodes, edges }
    this._dragSnapshot = null  // pre-drag history snapshot
    this._cfgEdit = null       // { fieldKey } for config-edit coalescing
    // RF object caches — stable identity per node/edge keyed by a content
    // signature. Without this, fresh objects every render make React Flow
    // re-measure + re-fit endlessly (onMove -> setState -> render -> loop).
    this._rfNodeCache = {}
    this._rfEdgeCache = {}
    this._rfRunNodeCache = {}
    this._rfRunEdgeCache = {}
    this._rfVerNodeCache = {}
    this._rfVerEdgeCache = {}
    this._onKey = this._onKey.bind(this)
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKey)
    this.seedRuns()
    this.ensureActiveOrg()
    this.loadNodeTypes()
  }

  // Source node-type metadata (palette, config-field schemas, declared outputs)
  // from the backend registry. On any failure the editor keeps the bundled
  // static catalog (see the _nodeDef / _fieldDefs / _paletteGroups accessors),
  // so it stays usable offline or against an older backend.
  async loadNodeTypes() {
    try {
      const manifests = await fetchNodeTypes()
      if (Array.isArray(manifests) && manifests.length) {
        this.setState({ nodeReg: buildNodeRegistry(manifests) })
      }
    } catch {
      // Fallback to the static catalog; apiFetch already handles 401 redirects.
    }
  }

  // ---------- node-type registry accessors (backend-or-static) ----------
  _nodeDef(type) { return this.state.nodeReg?.nodeDefs?.[type] || NODE_DEFS[type] }
  _fieldDefs(type) { return this.state.nodeReg?.fieldDefs?.[type] || FIELD_DEFS[type] || [] }
  _paletteGroups() { return this.state.nodeReg?.palette || PALETTE }

  // Middleware already gated the route on the session cookie, but the app still
  // needs an active org for the X-Org-Id header. On a cold load with no org
  // cookie, resolve it from /me (first workspace) or send the user to /login.
  async ensureActiveOrg() {
    if (getActiveOrg()) return
    try {
      const me = await fetchMe()
      if (me.memberships?.length) setActiveOrg(me.memberships[0].org_id)
      else window.location.href = '/login'
    } catch {
      // apiFetch already redirects to /login on a 401.
    }
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKey)
    if (this._timer) clearTimeout(this._timer)
  }

  // ---------- geometry ----------
  nodeById(id) { return this.state.nodes.find((n) => n.id === id) }
  nodeHeight(n) { return n.type === 'condition' ? 120 : 90 }

  // ---------- RF object memoization (stable identity) ----------
  // Returns a STABLE array reference (and stable element identities) whenever the
  // content signatures are unchanged. React Flow's controlled StoreUpdater re-runs
  // setNodes on every new `nodes`/`edges` array reference; without this, a fresh
  // array each render makes it re-measure + re-fit forever (infinite update loop).
  _memoRFNodes(cache, items) {
    const elems = cache.elems || (cache.elems = new Map())
    const seen = new Set()
    let changed = !cache.arr || cache.arr.length !== items.length
    const out = items.map(({ key, sig, make }, i) => {
      seen.add(key)
      const hit = elems.get(key)
      if (hit && hit.sig === sig) {
        if (!changed && cache.arr[i] !== hit.rf) changed = true
        return hit.rf
      }
      changed = true
      const rf = make()
      elems.set(key, { sig, rf })
      return rf
    })
    for (const k of elems.keys()) if (!seen.has(k)) { elems.delete(k); changed = true }
    if (!changed) return cache.arr
    cache.arr = out
    return out
  }

  // ---------- keyboard: undo/redo, copy/paste, escape ----------
  _isTyping(e) {
    const t = e.target.tagName
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable
  }
  _onKey(e) {
    if (e.key === 'Escape') { this.setState({ selectedId: null, selectedIds: [], insertEdge: null }); return }
    if (this.state.view !== 'editor' || this._isTyping(e)) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      if (e.shiftKey) this.redo(); else this.undo()
    } else if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); this.redo()
    } else if (mod && (e.key === 'c' || e.key === 'C')) {
      this.copySelection()
    } else if (mod && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault(); this.pasteClipboard()
    }
  }

  // ---------- undo / redo ----------
  _snapshot() {
    return {
      nodes: this.state.nodes.map((n) => ({ ...n, config: { ...n.config } })),
      edges: this.state.edges.map((e) => ({ ...e })),
    }
  }
  _pushHistory(before) {
    this.setState((s) => ({ history: { past: [...s.history.past, before].slice(-50), future: [] } }))
  }
  // Wrap a graph mutation so it can be undone. `mutator` performs the setState.
  _commit(mutator) {
    this._cfgEdit = null
    const before = this._snapshot()
    this._pushHistory(before)
    mutator()
  }
  undo() {
    this._cfgEdit = null
    this.setState((s) => {
      if (!s.history.past.length) return null
      const prev = s.history.past[s.history.past.length - 1]
      const cur = { nodes: s.nodes, edges: s.edges }
      return {
        nodes: prev.nodes, edges: prev.edges,
        history: { past: s.history.past.slice(0, -1), future: [cur, ...s.history.future] },
        selectedId: null, selectedIds: [], insertEdge: null,
      }
    })
  }
  redo() {
    this._cfgEdit = null
    this.setState((s) => {
      if (!s.history.future.length) return null
      const next = s.history.future[0]
      const cur = { nodes: s.nodes, edges: s.edges }
      return {
        nodes: next.nodes, edges: next.edges,
        history: { past: [...s.history.past, cur], future: s.history.future.slice(1) },
        selectedId: null, selectedIds: [], insertEdge: null,
      }
    })
  }

  // ---------- copy / paste ----------
  copySelection() {
    const ids = new Set(this.state.selectedIds && this.state.selectedIds.length ? this.state.selectedIds : (this.state.selectedId ? [this.state.selectedId] : []))
    if (!ids.size) return
    const nodes = this.state.nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n, config: { ...n.config } }))
    const edges = this.state.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e }))
    this._clipboard = { nodes, edges }
    this.setState({ toast: nodes.length + ' step' + (nodes.length === 1 ? '' : 's') + ' copied' }); this.flashToast()
  }
  pasteClipboard() {
    const cb = this._clipboard
    if (!cb || !cb.nodes.length) return
    this._commit(() => {
      const taken = new Set(this.state.nodes.map((n) => n.slug).filter(Boolean))
      const slugFor = (title) => {
        const base = this.slugify(title)
        let cand = base, i = 2
        while (taken.has(cand)) cand = base + '_' + i++
        taken.add(cand); return cand
      }
      const idMap = {}
      const newNodes = cb.nodes.map((n) => {
        const id = this.newId(); idMap[n.id] = id
        return { ...n, id, slug: slugFor(n.title), x: n.x + 40, y: n.y + 40, config: { ...n.config } }
      })
      const newEdges = cb.edges.map((e) => ({ id: 'e' + Math.random().toString(36).slice(2, 7), from: idMap[e.from], to: idMap[e.to], branch: e.branch }))
      const newIds = newNodes.map((n) => n.id)
      this.setState((s) => ({
        nodes: s.nodes.concat(newNodes), edges: s.edges.concat(newEdges),
        selectedIds: newIds, selectedId: newIds.length === 1 ? newIds[0] : null,
        toast: 'Pasted',
      }))
      this.flashToast()
    })
  }

  // ---------- auto-layout ----------
  tidyUp() {
    this._commit(() => {
      this.setState((s) => ({ nodes: layoutLR(s.nodes, s.edges) }))
      requestAnimationFrame(() => { if (this._rf) this._rf.fitView({ padding: 0.2, duration: 300 }) })
    })
  }

  // ---------- React Flow handlers (editor canvas) ----------
  onCanvasInit(inst) { this._rf = inst }
  onCanvasMove(_, viewport) { if (viewport && Math.abs(viewport.zoom - this.state.zoom) > 0.001) this.setState({ zoom: viewport.zoom }) }
  onRFConnect(c) {
    if (!c.source || !c.target) return
    if (c.source === c.target) return
    const branch = fromRFConnection(c).branch || null
    const exists = this.state.edges.some((ed) => ed.from === c.source && ed.to === c.target && (ed.branch || null) === branch)
    if (exists) return
    this._commit(() => {
      const edge = { id: 'e' + Date.now(), from: c.source, to: c.target, branch: branch || undefined }
      this.setState((s) => ({ edges: s.edges.concat([edge]), toast: 'Connected' }))
      this.flashToast()
    })
  }
  onRFNodeDragStart() { this._dragSnapshot = this._snapshot() }
  onRFNodeDragStop(_, __, dragged) {
    const pos = new Map((dragged || []).map((n) => [n.id, n.position]))
    const snap = this._dragSnapshot
    this._dragSnapshot = null
    this.setState((s) => ({
      nodes: pos.size ? s.nodes.map((n) => (pos.has(n.id) ? { ...n, x: pos.get(n.id).x, y: pos.get(n.id).y } : n)) : s.nodes,
      history: snap ? { past: [...s.history.past, snap].slice(-50), future: [] } : s.history,
    }))
  }
  onRFNodesDelete(deleted) { this.deleteNodes(deleted.map((n) => n.id)) }
  onRFSelectionChange(sel) {
    const nodeIds = (sel.nodes || []).map((n) => n.id)
    const edgeIds = (sel.edges || []).map((e) => e.id)
    // Bail when nothing changed — controlled `selected` flags make RF re-emit
    // selection on every render, which would otherwise loop setState forever.
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
    if (same(nodeIds, this.state.selectedIds || []) && same(edgeIds, this.state.selectedEdgeIds || [])) return
    this.setState({ selectedIds: nodeIds, selectedEdgeIds: edgeIds, selectedId: nodeIds.length === 1 ? nodeIds[0] : null })
  }
  onRFPaneClick() { this.setState({ selectedId: null, selectedIds: [], insertEdge: null }) }
  onRFDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  onRFDrop(e) {
    e.preventDefault()
    const type = e.dataTransfer.getData('text/type')
    if (!type) return
    let pos = { x: 200, y: 260 }
    if (this._rf && this._rf.screenToFlowPosition) {
      const p = this._rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      pos = { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - 45) }
    }
    this.addNodeAt(type, pos)
  }
  onEditorZoom(delta) { if (this._rf) { delta > 0 ? this._rf.zoomIn() : this._rf.zoomOut() } }
  onEditorFit() { if (this._rf) this._rf.fitView({ padding: 0.2, duration: 300 }) }

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
  outputFieldsFor(node) {
    const fallback = OUTPUT_FIELDS[node.type === 'condition' ? 'cond' : node.type] || []
    const reg = this.state.nodeReg?.outputs?.[node.type]
    if (!reg) return fallback
    // The backend owns the output schema (path + type); merge in illustrative
    // sample values from the bundled catalog by path for the Data tab.
    const sampleByPath = {}
    fallback.forEach((o) => { sampleByPath[o.path] = o.sample })
    return reg.map((o) => ({ path: o.path, type: o.type, sample: sampleByPath[o.path] ?? '' }))
  }
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
  _makeNode(type, x, y) {
    const d = this._nodeDef(type)
    return { id: this.newId(), slug: this.makeSlug(d.title), type, title: d.title, sub: d.sub, x, y, configured: (type === 'trigger' || type === 'condition' || type === 'delay' || type === 'filter'), config: {} }
  }
  addNode(type, atEdge) {
    this._commit(() => {
      const node = this._makeNode(type, 200, 260)
      let edges = this.state.edges.slice()
      if (atEdge) {
        const ed = this.state.edges.find((e) => e.id === atEdge)
        const a = this.nodeById(ed.from), b = this.nodeById(ed.to)
        node.x = (a.x + b.x) / 2; node.y = (a.y + b.y) / 2
        edges = edges.filter((e) => e.id !== atEdge)
        edges.push({ id: 'e' + Date.now(), from: ed.from, to: node.id, branch: ed.branch })
        edges.push({ id: 'e' + (Date.now() + 1), from: node.id, to: ed.to })
      } else {
        const sel = this.state.selectedId ? this.nodeById(this.state.selectedId) : null
        if (sel) {
          node.x = sel.x + 332; node.y = sel.y
          if (sel.type !== 'condition') edges.push({ id: 'e' + Date.now(), from: sel.id, to: node.id })
        } else if (this.state.nodes.length) {
          const last = this.state.nodes[this.state.nodes.length - 1]
          node.x = last.x + 332; node.y = last.y
        } else { node.x = 80; node.y = 250 }
      }
      this.setState({ nodes: this.state.nodes.concat([node]), edges, selectedId: node.id, selectedIds: [node.id], tab: 'settings', insertEdge: null, toast: 'Added “' + this._nodeDef(type).title + '”' })
      this.flashToast()
    })
  }
  // Drop from the palette: place at the drop point, no auto-connect.
  addNodeAt(type, pos) {
    this._commit(() => {
      const node = this._makeNode(type, pos.x, pos.y)
      this.setState((s) => ({ nodes: s.nodes.concat([node]), selectedId: node.id, selectedIds: [node.id], tab: 'settings', insertEdge: null, toast: 'Added “' + this._nodeDef(type).title + '”' }))
      this.flashToast()
    })
  }
  onPaletteAdd(type) { this.addNode(type, this.state.insertEdge) }
  deleteNode(id) { this.deleteNodes([id]) }
  deleteNodes(ids) {
    const idSet = new Set(ids)
    if (!idSet.size) return
    this._commit(() => {
      this.setState((s) => {
        let edges = s.edges.slice()
        // Bridge each deleted node's surviving in-edges to its surviving out-edges.
        ids.forEach((id) => {
          const ins = edges.filter((e) => e.to === id && !idSet.has(e.from))
          const outs = edges.filter((e) => e.from === id && !idSet.has(e.to))
          if (ins.length && outs.length) {
            ins.forEach((ie) => outs.forEach((oe) => { edges.push({ id: 'e' + Math.random().toString(36).slice(2, 7), from: ie.from, to: oe.to, branch: ie.branch }) }))
          }
        })
        edges = edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to))
        const nodes = s.nodes.filter((n) => !idSet.has(n.id))
        return { nodes, edges, selectedId: null, selectedIds: [], toast: ids.length > 1 ? ids.length + ' steps deleted' : 'Step deleted' }
      })
      this.flashToast()
    })
  }
  // Coalesce rapid edits to one field into a single undo step.
  _beginCoalesced(fieldKey) {
    if (!this._cfgEdit || this._cfgEdit.fieldKey !== fieldKey) {
      this._pushHistory(this._snapshot())
      this._cfgEdit = { fieldKey }
    }
  }
  endFieldEdit() { this._cfgEdit = null }
  updateConfig(id, key, val) {
    this._beginCoalesced(id + '::' + key)
    this.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: val } } : n)) }))
  }
  saveConfig(id) {
    this._commit(() => {
      this.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, configured: true, sub: this._nodeDef(n.type).sub } : n)), toast: 'Step configured' }))
      this.flashToast()
    })
  }
  renameNode(id, v) {
    this._beginCoalesced(id + '::__title')
    this.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, title: v } : n)) }))
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

    const rfNodes = this._memoRFNodes(this._rfNodeCache, s.nodes.map((n) => {
      const rs = liveSteps ? liveSteps[n.id] : null
      const sig = [n.x, n.y, n.title, n.sub, n.type, n.configured, n.slug, rs ? rs.st + '|' + (rs.ms || '') : ''].join('~')
      return { key: n.id, sig, make: () => toRFNode(n, { runState: rs }) }
    }))

    const onInsert = (edgeId) => { this.setState({ insertEdge: edgeId, toast: 'Pick a step to insert' }); this.flashToast() }
    const rfEdges = this._memoRFNodes(this._rfEdgeCache, s.edges.map((ed) => {
      const rs = liveSteps ? liveSteps[ed.from] : null
      const running = !!(rs && rs.st === 'running')
      const active = rs && (rs.st === 'ok' || rs.st === 'running')
      const insertActive = s.insertEdge === ed.id
      const sig = [ed.from, ed.to, ed.branch || '', running, active && !running ? 'a' : '', active ? 'w' : '', insertActive].join('~')
      return { key: ed.id, sig, make: () => toRFEdge(ed, { running, colorOverride: active && !running ? '#7CC9A1' : null, widthOverride: active ? 2.6 : null, onInsert, insertActive }) }
    }))

    // palette
    const q = s.paletteQuery.trim().toLowerCase()
    const groups = this._paletteGroups().map((g) => ({
      title: g.title,
      items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)).map((it) => {
        const cat = NODE_CATEGORIES[it.cat]
        return { type: it.type, label: it.label, desc: it.desc, kind: it.kind, color: cat.c, bg: cat.bg, onAdd: () => this.onPaletteAdd(it.type), onDragStart: (e) => e.dataTransfer.setData('text/type', it.type) }
      }),
    })).filter((g) => g.items.length)

    return {
      palette: { hint: s.insertEdge ? 'Choose a step to insert into the connection.' : 'Click or drag a step onto the canvas.', query: s.paletteQuery, onSearch: (e) => this.setState({ paletteQuery: e.target.value }), groups },
      canvas: {
        showEmpty: s.nodes.length === 0,
        zoomPct: Math.round(s.zoom * 100) + '%',
        onZoomIn: () => this.onEditorZoom(1), onZoomOut: () => this.onEditorZoom(-1), onZoomReset: () => this.onEditorFit(), onFit: () => this.onEditorFit(), onTidy: () => this.tidyUp(),
        onAddTrigger: () => this.addNode('trigger', null),
        showRunBanner: s.runStatus === 'success',
        onOpenRun: () => this.openRun(),
        flow: {
          nodes: rfNodes, edges: rfEdges,
          onInit: (inst) => this.onCanvasInit(inst),
          onMove: (e, vp) => this.onCanvasMove(e, vp),
          onConnect: (c) => this.onRFConnect(c),
          onNodeDragStart: (e, n, ns) => this.onRFNodeDragStart(e, n, ns),
          onNodeDragStop: (e, n, ns) => this.onRFNodeDragStop(e, n, ns),
          onNodesDelete: (d) => this.onRFNodesDelete(d),
          onSelectionChange: (sel2) => this.onRFSelectionChange(sel2),
          onPaneClick: () => this.onRFPaneClick(),
          onDrop: (e) => this.onRFDrop(e),
          onDragOver: (e) => this.onRFDragOver(e),
        },
      },
      config: { sel: sel ? this.configVM(sel) : null, onSaveConfig: () => this.saveConfig(s.selectedId) },
    }
  }

  configVM(sel) {
    const s = this.state
    const cat = NODE_CATEGORIES[this._nodeDef(sel.type).cat]
    const cfg = sel.config || {}
    const slugMap = {}; s.nodes.forEach((n) => { if (n.slug) slugMap[n.slug] = { label: n.title } })
    const ancIds = this.ancestorsOf(sel.id)
    const vars = s.nodes.filter((n) => ancIds.has(n.id)).map((n) => ({ slug: n.slug, label: n.title, fields: this.outputFieldsFor(n) }))
    const fields = this._fieldDefs(sel.type).map((f) => ({
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
      title: sel.title, typeLabel: TYPE_LABELS[sel.type] || 'Step', kind: this._nodeDef(sel.type).kind, catColor: cat.c, catBg: cat.bg,
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

    const runNodes = this._memoRFNodes(this._rfRunNodeCache, s.nodes.map((n) => {
      const st = stMap[n.id] || { st: 'skip' }
      let trueTaken = false, falseTaken = false
      if (n.type === 'condition') {
        s.edges.forEach((ed) => { if (ed.from === n.id) { const tst = stMap[ed.to]; const taken = !!(tst && tst.st !== 'skip' && tst.st !== 'pending'); if (ed.branch === 'true') trueTaken = trueTaken || taken; else if (ed.branch === 'false') falseTaken = falseTaken || taken } })
      }
      const selected = s.selectedStep === n.id
      const sig = [n.x, n.y, n.title, n.sub, n.type, st.st, st.ms || '', selected, trueTaken, falseTaken].join('~')
      return { key: n.id, sig, make: () => toRFNode(n, { type: 'fmRunNode', decor: { runState: st, selected, isCondition: n.type === 'condition', trueTaken, falseTaken } }) }
    }))

    const runEdges = this._memoRFNodes(this._rfRunEdgeCache, s.edges.map((ed) => {
      const fst = stMap[ed.from], tst = stMap[ed.to]
      const both = fst && tst && fst.st !== 'skip' && tst.st !== 'skip' && fst.st !== 'error'
      const errEdge = fst && fst.st === 'error'
      const color = both ? '#7CC9A1' : errEdge ? '#E8C0C1' : '#DDE0E5'
      const sig = [ed.from, ed.to, ed.branch || '', color, both ? 2.6 : 2].join('~')
      return { key: ed.id, sig, make: () => toRFEdge(ed, { colorOverride: color, widthOverride: both ? 2.6 : 2 }) }
    }))

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

    return {
      runCountLabel: s.runs.length + ' total', hero, runList,
      onRerun: () => { this.setState({ view: 'editor' }); setTimeout(() => this.runWorkflow(), 60) },
      flow: {
        readOnly: true, nodes: runNodes, edges: runEdges,
        fitKey: 'run|' + s.activeRunId,
        onNodeClick: (e, node) => this.setState({ selectedStep: node.id }),
      },
      step: this.stepVM(stMap),
    }
  }

  stepVM(stMap) {
    const s = this.state
    const sn = this.nodeById(s.selectedStep)
    if (!sn) return null
    const sst = stMap[s.selectedStep] || { st: 'skip' }
    const cat = NODE_CATEGORIES[this._nodeDef(sn.type).cat]
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
      title: sn.title, kind: this._nodeDef(sn.type).kind, catColor: cat.c, catBg: cat.bg,
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
    const verNodeDesc = (n, diff) => ({ key: n.id, sig: [n.x, n.y, n.title, n.summary, n.type, diff].join('~'), make: () => toRFNode(n, { type: 'fmVerNode', decor: { diff } }) })
    const edgeDesc = (lookup, from, to, branch, ds) => {
      const a = lookup[from], b = lookup[to]; if (!a || !b) return null
      const pal = DIFF_STATUS[ds || 'view']
      const id = from + '>' + to + '>' + (branch || '')
      return { key: id, sig: [ds || 'view'].join('~'), make: () => toRFEdge({ id, from, to, branch }, { colorOverride: pal.edge, widthOverride: ds === 'added' ? 2.6 : 2, dash: ds === 'removed' ? '5 6' : null }) }
    }
    let nodeDescs = [], edgeDescs = []
    if (s.verTab === 'compare') {
      const d = this.diffVersions(s.cmpA, s.cmpB)
      cmpAName = d.a.label + ' · ' + d.a.name; cmpBName = d.b.label + ' · ' + d.b.name
      const lookup = {}; d.b.nodes.forEach((n) => (lookup[n.id] = n)); d.a.nodes.forEach((n) => { if (!lookup[n.id]) lookup[n.id] = n })
      rawNodes = Object.keys(lookup).map((k) => lookup[k])
      nodeDescs = rawNodes.map((n) => verNodeDesc(n, d.status[n.id] || 'same'))
      const ekey = {}
      d.a.edges.forEach((e) => { ekey[e.from + '>' + e.to + '>' + (e.branch || '')] = { from: e.from, to: e.to, branch: e.branch, inA: true, inB: false } })
      d.b.edges.forEach((e) => { const k = e.from + '>' + e.to + '>' + (e.branch || ''); if (ekey[k]) ekey[k].inB = true; else ekey[k] = { from: e.from, to: e.to, branch: e.branch, inA: false, inB: true } })
      edgeDescs = Object.keys(ekey).map((k) => { const e = ekey[k]; const ds = e.inA && e.inB ? 'same' : e.inB ? 'added' : 'removed'; return edgeDesc(lookup, e.from, e.to, e.branch, ds) }).filter(Boolean)
      changes = d.changes.map((c) => ({ kind: c.kind, title: c.title, detail: c.detail }))
      hasChanges = changes.length > 0
      bannerText = 'Comparing ' + d.a.label + ' → ' + d.b.label; bannerSub = changes.length + ' change' + (changes.length === 1 ? '' : 's'); bannerTone = 'compare'
    } else {
      const lookup = {}; verSel.nodes.forEach((n) => (lookup[n.id] = n))
      rawNodes = verSel.nodes
      nodeDescs = verSel.nodes.map((n) => verNodeDesc(n, 'view'))
      edgeDescs = verSel.edges.map((e) => edgeDesc(lookup, e.from, e.to, e.branch, 'view')).filter(Boolean)
      bannerText = verSel.label + ' · ' + verSel.name
      bannerSub = verSel.status === 'live' ? 'Live version · read-only' : verSel.status === 'canary' ? 'Canary draft · read-only' : 'Archived version · read-only'
      bannerTone = verSel.status
    }
    verNodes = this._memoRFNodes(this._rfVerNodeCache, nodeDescs)
    verEdges = this._memoRFNodes(this._rfVerEdgeCache, edgeDescs)

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
      flow: { readOnly: true, nodes: verNodes, edges: verEdges, fitKey: s.verTab + '|' + s.verSelected + '|' + s.cmpA + '|' + s.cmpB },
      bannerText, bannerSub, bannerTone, changes, hasChanges, cmpAName, cmpBName, canary,
    }
  }

  // ===========================================================================
  render() {
    const vm = this.buildViewModels()
    const s = this.state
    return (
      <div className="flex h-screen w-full overflow-hidden bg-[#F4F5F7]">
        <AppRail items={vm.navItems} onLogout={() => logout()} />
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
