'use client'
import { Component, createRef } from 'react'

// Reusable expression / reference builder (spec §6). A contenteditable surface
// that renders `{{ slug.field }}` tokens as live chips, with an autocomplete
// popover listing upstream step outputs. Serializes back to the token syntax.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function chipHtmlFor(slug, field, slugMap) {
  const meta = (slugMap || {})[slug]
  const ok = !!meta
  const label = ok ? meta.label : slug
  const bg = ok ? '#EAF2FF' : '#FBE5E6'
  const bd = ok ? '#CADFFF' : '#F2C9CA'
  const fg = ok ? '#0E5AD6' : '#CC3338'
  const remove =
    '<span data-remove="1" role="button" title="Remove reference" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:4px;margin:0 -1px 0 1px;cursor:pointer;color:' +
    fg +
    ';opacity:.5"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="pointer-events:none"><path d="M18 6 6 18M6 6l12 12"/></svg></span>'
  return (
    '<span contenteditable="false" data-chip="1" data-slug="' + esc(slug) + '" data-field="' + esc(field) + '" ' +
    'style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;background:' + bg + ';border:1px solid ' + bd + ';color:' + fg +
    ";font-size:11.5px;font-weight:600;line-height:1.45;padding:1px 4px 1px 8px;border-radius:7px;margin:1px 2px;font-family:'JetBrains Mono',monospace;white-space:nowrap;cursor:default;user-select:none\">" +
    (ok ? '' : '<span style="margin-right:1px">⚠</span>') +
    '<span>' + esc(label) + '</span><span style="opacity:.5">.' + esc(field) + '</span>' + remove + '</span>'
  )
}

export class TokenField extends Component {
  constructor(props) {
    super(props)
    this.ref = createRef()
    this.state = { open: false }
    this.savedRange = null
  }
  componentDidMount() { this.paint() }
  componentDidUpdate(prev) { if (prev.fieldKey !== this.props.fieldKey) this.paint() }

  toHtml(val) {
    const re = /\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]+)\s*\}\}/g
    let out = '', last = 0, m
    while ((m = re.exec(val))) {
      out += esc(val.slice(last, m.index)).replace(/\n/g, '<br>')
      out += chipHtmlFor(m[1], m[2], this.props.slugMap)
      last = m.index + m[0].length
    }
    out += esc(val.slice(last)).replace(/\n/g, '<br>')
    return out
  }
  paint() { const el = this.ref.current; if (el) el.innerHTML = this.toHtml(this.props.value || '') }

  serialize() {
    const el = this.ref.current
    if (!el) return ''
    let out = ''
    const walk = (node) => {
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) out += c.nodeValue
        else if (c.nodeName === 'BR') out += '\n'
        else if (c.dataset && c.dataset.slug) out += '{{ ' + c.dataset.slug + '.' + c.dataset.field + ' }}'
        else if (c.nodeType === 1) walk(c)
      })
    }
    walk(el)
    return out.replace(/​/g, '')
  }
  saveRange() {
    const s = window.getSelection()
    if (s && s.rangeCount && this.ref.current && this.ref.current.contains(s.anchorNode)) {
      this.savedRange = s.getRangeAt(0).cloneRange()
    }
  }
  commit() { if (this.props.onCommit) this.props.onCommit(this.serialize()) }
  onInput() { this.saveRange(); this.commit() }

  insertToken(slug, field) {
    const el = this.ref.current
    el.focus()
    const sel = window.getSelection()
    let range = this.savedRange
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange(); range.selectNodeContents(el); range.collapse(false)
    }
    range.deleteContents()
    const tmp = document.createElement('div')
    tmp.innerHTML = chipHtmlFor(slug, field, this.props.slugMap)
    const chip = tmp.firstChild
    const sp = document.createTextNode(' ')
    range.insertNode(sp); range.insertNode(chip)
    range.setStartAfter(sp); range.collapse(true)
    sel.removeAllRanges(); sel.addRange(range)
    this.savedRange = range.cloneRange()
    this.setState({ open: false })
    this.commit()
  }

  render() {
    const multi = !!this.props.multiline
    const vars = this.props.vars || []
    return (
      <div style={{ position: 'relative' }}>
        <div
          ref={this.ref}
          contentEditable
          suppressContentEditableWarning
          data-ph={this.props.placeholder || ''}
          spellCheck={false}
          className="tokfield"
          onInput={() => this.onInput()}
          onKeyUp={() => this.saveRange()}
          onMouseUp={() => this.saveRange()}
          onBlur={() => this.saveRange()}
          onMouseDown={(e) => {
            const rm = e.target.closest && e.target.closest('[data-remove]')
            if (rm) {
              e.preventDefault()
              const chip = rm.closest('[data-chip]')
              if (chip) { chip.remove(); this.savedRange = null; this.commit() }
            }
          }}
          style={{
            width: '100%', boxSizing: 'border-box', border: '1px solid #E0E2E7', borderRadius: 9,
            fontSize: '13.5px', color: '#181B22', outline: 'none', background: '#fff',
            padding: multi ? '10px 12px' : '8px 38px 8px 12px', lineHeight: multi ? '1.6' : '22px',
            ...(multi
              ? { minHeight: 92, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
              : { minHeight: 40, whiteSpace: 'nowrap', overflowX: 'auto', overflowY: 'hidden' }),
          }}
        />
        <button
          type="button"
          title="Insert data from another step"
          onMouseDown={(e) => { e.preventDefault(); this.saveRange() }}
          onClick={() => this.setState((s) => ({ open: !s.open }))}
          style={{
            position: 'absolute', top: multi ? 8 : 7, right: 7, width: 26, height: 26, borderRadius: 7,
            border: '1px solid ' + (this.state.open ? '#0E6EFF' : '#E0E2E7'),
            background: this.state.open ? '#EAF2FF' : '#fff', color: this.state.open ? '#0E6EFF' : '#8A919C',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, zIndex: 2,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 4H7a2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2V17a2 2 0 0 0 2 2h1" />
            <path d="M16 4h1a2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2 2 2 0 0 0-2 2V17a2 2 0 0 1-2 2h-1" />
          </svg>
        </button>
        {this.state.open && (
          <div
            style={{
              position: 'absolute', top: multi ? 40 : 44, right: 0, width: 300, maxHeight: 280, overflowY: 'auto',
              background: '#fff', border: '1px solid #E6E8EC', borderRadius: 11,
              boxShadow: '0 14px 34px -12px rgba(20,24,32,.32)', padding: 10, zIndex: 30,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A6ACB6', padding: '0 4px 8px' }}>
              Insert output from
            </div>
            {vars.length ? vars.map((v, vi) => (
              <div key={vi} style={{ marginBottom: vi === vars.length - 1 ? 0 : 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px 6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1B2029' }}>{v.label}</span>
                  <span style={{ fontSize: 11, color: '#9AA1AC', fontFamily: "'JetBrains Mono',monospace" }}>{v.slug}</span>
                </div>
                {v.fields.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {v.fields.map((f, fi) => (
                      <div
                        key={fi}
                        onMouseDown={(e) => { e.preventDefault(); this.insertToken(v.slug, f.path) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F7FC')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0E5AD6', fontFamily: "'JetBrains Mono',monospace" }}>{f.path}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#9AA1AC', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(f.sample)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11.5px', color: '#A6ACB6', padding: '2px 6px' }}>No sample outputs</div>
                )}
              </div>
            )) : (
              <div style={{ fontSize: '12.5px', color: '#8A919C', padding: '8px 6px', lineHeight: 1.5 }}>
                No upstream steps yet. Connect a step before this one to use its output.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
}
