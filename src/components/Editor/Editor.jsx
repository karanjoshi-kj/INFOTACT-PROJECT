import { useRef, useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import Toolbar from './Toolbar.jsx'
import { exportDocumentPdf, updateRoomMemberStatus } from '../../services/api.js'
import './Editor.css'
import { getToken } from '../../utils/auth.js'
import DOMPurify from 'dompurify'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1234'

// The host always gets this colour. Collaborators get one of the colours below
// (one each - the room keeps them from repeating).
const HOST_COLOR = '#f59e0b'
const USER_COLORS = [
  '#6366f1', '#ec4899', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#14b8a6', '#a855f7', '#06b6d4', '#84cc16',
]

// Same name -> same colour (only used until the room hands out a unique colour)
const colorFor = (name = '') => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return USER_COLORS[h % USER_COLORS.length]
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'

// ---------------------------------------------------------------
// SPREADSHEET HELPERS
// A spreadsheet is a normal <table class="sheet"> inside the document,
// so it is saved and synced exactly like the rest of the text.
// ---------------------------------------------------------------
const colLetter = (i) => String.fromCharCode(65 + i)

function buildSheetHtml(rows = 6, cols = 5) {
  let html = '<table class="sheet"><thead><tr><th contenteditable="false"></th>'
  for (let c = 0; c < cols; c++) html += `<th contenteditable="false">${colLetter(c)}</th>`
  html += '</tr></thead><tbody>'
  for (let r = 1; r <= rows; r++) {
    html += `<tr><th contenteditable="false">${r}</th>`
    for (let c = 0; c < cols; c++) html += '<td><br></td>'
    html += '</tr>'
  }
  html += '</tbody></table><p><br></p>'
  return html
}

// "B3" -> the <td> in column B, row 3 of that table
function getSheetCell(table, ref) {
  const col = ref.charCodeAt(0) - 65
  const row = parseInt(ref.slice(1), 10) - 1
  const tr = table.tBodies[0] && table.tBodies[0].rows[row]
  return tr ? tr.cells[col + 1] || null : null // +1 because the first cell is the row number
}

// ---------------------------------------------------------------
// FORMULA ENGINE
// Supports + - * / ^ & % ( ) comparisons (= <> < > <= >=), cell refs (A1),
// ranges (A1:B5), numbers, "text" and these functions:
//   Math/stats : SUM AVERAGE AVG MIN MAX COUNT COUNTA PRODUCT MEDIAN MODE STDEV VAR
//                ROUND ROUNDUP ROUNDDOWN ABS SQRT POWER MOD INT CEILING FLOOR PI
//   Logical    : IF AND OR NOT IFERROR
//   Conditional: SUMIF COUNTIF AVERAGEIF
//   Text       : CONCAT CONCATENATE LEN UPPER LOWER TRIM LEFT RIGHT MID
//   Lookup     : VLOOKUP HLOOKUP INDEX MATCH
//   Date       : TODAY NOW
// Nothing is run with eval/Function, so nothing unsafe can execute.
// ---------------------------------------------------------------
const FORMULA_TOKEN =
  /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|"((?:[^"]|"")*)"|([A-Za-z]\d+:[A-Za-z]\d+)|([A-Za-z]\d+)(?![A-Za-z0-9_(])|([A-Za-z_][A-Za-z0-9_.]*)|(<=|>=|<>|[-+*/^&=<>%(),]))/y

function tokenizeFormula(src) {
  const tokens = []
  const re = new RegExp(FORMULA_TOKEN.source, 'y')
  let pos = 0
  while (pos < src.length) {
    if (!src.slice(pos).trim()) break
    re.lastIndex = pos
    const m = re.exec(src)
    if (!m) throw new Error('bad token')
    pos = re.lastIndex
    if (m[1] !== undefined) tokens.push({ t: 'num', v: parseFloat(m[1]) })
    else if (m[2] !== undefined) tokens.push({ t: 'str', v: m[2].replace(/""/g, '"') })
    else if (m[3]) tokens.push({ t: 'range', v: m[3].toUpperCase() })
    else if (m[4]) tokens.push({ t: 'ref', v: m[4].toUpperCase() })
    else if (m[5]) tokens.push({ t: 'id', v: m[5].toUpperCase() })
    else tokens.push({ t: 'op', v: m[6] })
  }
  return tokens
}

function parseFormula(tokens) {
  let i = 0
  const isOp = (v) => tokens[i] && tokens[i].t === 'op' && tokens[i].v === v
  const eat = (v) => {
    if (!isOp(v)) throw new Error(`expected ${v}`)
    i++
  }

  const parseCompare = () => {
    let left = parseConcat()
    while (tokens[i] && tokens[i].t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(tokens[i].v)) {
      const op = tokens[i++].v
      left = { t: 'bin', op, l: left, r: parseConcat() }
    }
    return left
  }
  const parseConcat = () => {
    let left = parseAdd()
    while (isOp('&')) {
      i++
      left = { t: 'bin', op: '&', l: left, r: parseAdd() }
    }
    return left
  }
  const parseAdd = () => {
    let left = parseMul()
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].v
      left = { t: 'bin', op, l: left, r: parseMul() }
    }
    return left
  }
  const parseMul = () => {
    let left = parsePow()
    while (isOp('*') || isOp('/')) {
      const op = tokens[i++].v
      left = { t: 'bin', op, l: left, r: parsePow() }
    }
    return left
  }
  const parsePow = () => {
    let left = parseUnary()
    while (isOp('^')) {
      i++
      left = { t: 'bin', op: '^', l: left, r: parseUnary() }
    }
    return left
  }
  const parseUnary = () => {
    if (isOp('-')) {
      i++
      return { t: 'neg', e: parseUnary() }
    }
    if (isOp('+')) {
      i++
      return parseUnary()
    }
    return parsePostfix()
  }
  const parsePostfix = () => {
    let node = parsePrimary()
    while (isOp('%')) {
      i++
      node = { t: 'pct', e: node }
    }
    return node
  }
  const parsePrimary = () => {
    const tk = tokens[i++]
    if (!tk) throw new Error('unexpected end')
    if (tk.t === 'num' || tk.t === 'str') return { t: 'lit', v: tk.v }
    if (tk.t === 'ref') return { t: 'ref', ref: tk.v }
    if (tk.t === 'range') return { t: 'range', range: tk.v }
    if (tk.t === 'id') {
      if (isOp('(')) {
        i++
        const args = []
        if (!isOp(')')) {
          for (;;) {
            args.push(parseCompare())
            if (isOp(',')) {
              i++
              continue
            }
            break
          }
        }
        eat(')')
        return { t: 'fn', name: tk.v, args }
      }
      if (tk.v === 'TRUE') return { t: 'lit', v: true }
      if (tk.v === 'FALSE') return { t: 'lit', v: false }
      throw new Error('unknown name')
    }
    if (tk.t === 'op' && tk.v === '(') {
      const inner = parseCompare()
      eat(')')
      return inner
    }
    throw new Error('unexpected token')
  }

  const ast = parseCompare()
  if (i < tokens.length) throw new Error('unexpected extra input')
  return ast
}

const pad2 = (x) => String(x).padStart(2, '0')
const todayText = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const nowText = () => {
  const d = new Date()
  return `${todayText()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// Calculates things like =SUM(A1:A3)+B2*2 or =IF(A1>5,"big","small")
function evaluateFormula(table, formula) {
  // Value of one cell: number, text, or null when empty
  const rawCell = (ref) => {
    const cell = getSheetCell(table, ref)
    if (!cell) return null
    const text = cell.textContent.trim()
    if (text === '') return null
    const n = Number(text.replace(/,/g, ''))
    return Number.isNaN(n) ? text : n
  }

  const rangeValues = (range) => {
    const m = range.match(/^([A-Z])(\d+):([A-Z])(\d+)$/)
    if (!m) throw new Error('bad range')
    const c1 = m[1].charCodeAt(0)
    const c2 = m[3].charCodeAt(0)
    const r1 = parseInt(m[2], 10)
    const r2 = parseInt(m[4], 10)
    if (Math.abs(r2 - r1) > 1000) throw new Error('range too large')
    const rows = []
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      const row = []
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) row.push(rawCell(String.fromCharCode(c) + r))
      rows.push(row)
    }
    return { rows }
  }

  const isRange = (v) => !!v && typeof v === 'object' && Array.isArray(v.rows)
  const toNum = (v) => {
    if (isRange(v)) throw new Error('range used as a number')
    if (v === null || v === undefined || v === '') return 0
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'number') return v
    const n = parseFloat(v)
    return Number.isNaN(n) ? 0 : n
  }
  const toText = (v) => {
    if (isRange(v)) throw new Error('range used as text')
    if (v === null || v === undefined) return ''
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    return String(v)
  }
  const truthy = (v) => {
    if (isRange(v)) throw new Error('range used as condition')
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (typeof v === 'string') return v !== '' && v.toUpperCase() !== 'FALSE'
    return false
  }
  const flat = (list) => list.flatMap((x) => (isRange(x) ? x.rows.flat() : [x]))
  const numsOf = (list) => flat(list).filter((v) => typeof v === 'number')

  const cmp = (a, b) => {
    if (typeof a === 'string' || typeof b === 'string') {
      const x = toText(a).toLowerCase()
      const y = toText(b).toLowerCase()
      return x < y ? -1 : x > y ? 1 : 0
    }
    const x = toNum(a)
    const y = toNum(b)
    return x < y ? -1 : x > y ? 1 : 0
  }

  // Criteria for SUMIF / COUNTIF / AVERAGEIF, e.g. ">5", "<>0", "apple", 3
  const matches = (v, crit) => {
    let op = '='
    let rhs = crit
    if (typeof crit === 'string') {
      const m = crit.match(/^(<=|>=|<>|<|>|=)?(.*)$/)
      op = m[1] || '='
      rhs = m[2]
      if (rhs.trim() !== '' && !Number.isNaN(Number(rhs))) rhs = Number(rhs)
    }
    if (v === null) return false
    const c = cmp(v, rhs)
    if (op === '=') return c === 0
    if (op === '<>') return c !== 0
    if (op === '<') return c < 0
    if (op === '>') return c > 0
    if (op === '<=') return c <= 0
    return c >= 0
  }

  const findIndex = (vec, key, exact) => {
    if (exact) return vec.findIndex((x) => x !== null && cmp(x, key) === 0)
    let idx = -1
    vec.forEach((x, k) => {
      if (x !== null && cmp(x, key) <= 0) idx = k
    })
    return idx
  }

  const roundAway = (x) => Math.sign(x) * Math.round(Math.abs(x))

  const binary = (op, a, b) => {
    switch (op) {
      case '+': return toNum(a) + toNum(b)
      case '-': return toNum(a) - toNum(b)
      case '*': return toNum(a) * toNum(b)
      case '/': {
        const d = toNum(b)
        if (d === 0) throw new Error('divide by zero')
        return toNum(a) / d
      }
      case '^': return Math.pow(toNum(a), toNum(b))
      case '&': return toText(a) + toText(b)
      case '=': return cmp(a, b) === 0
      case '<>': return cmp(a, b) !== 0
      case '<': return cmp(a, b) < 0
      case '>': return cmp(a, b) > 0
      case '<=': return cmp(a, b) <= 0
      case '>=': return cmp(a, b) >= 0
      default: throw new Error('bad operator')
    }
  }

  const callFn = (name, argNodes) => {
    // IF and IFERROR only calculate the branch they need
    if (name === 'IF') {
      if (argNodes.length < 2) throw new Error('IF needs 2+ arguments')
      if (truthy(ev(argNodes[0]))) return ev(argNodes[1])
      return argNodes[2] ? ev(argNodes[2]) : false
    }
    if (name === 'IFERROR') {
      try {
        const v = ev(argNodes[0])
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('not finite')
        return v
      } catch {
        return argNodes[1] ? ev(argNodes[1]) : ''
      }
    }

    const a = argNodes.map(ev)
    const n = (k, d = 0) => (a[k] === undefined ? d : toNum(a[k]))

    switch (name) {
      // ----- math & statistics -----
      case 'SUM': return numsOf(a).reduce((x, y) => x + y, 0)
      case 'AVERAGE':
      case 'AVG': {
        const v = numsOf(a)
        return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0
      }
      case 'MIN': {
        const v = numsOf(a)
        return v.length ? Math.min(...v) : 0
      }
      case 'MAX': {
        const v = numsOf(a)
        return v.length ? Math.max(...v) : 0
      }
      case 'COUNT': return numsOf(a).length
      case 'COUNTA': return flat(a).filter((v) => v !== null && v !== '').length
      case 'PRODUCT': {
        const v = numsOf(a)
        return v.length ? v.reduce((x, y) => x * y, 1) : 0
      }
      case 'MEDIAN': {
        const v = numsOf(a).sort((x, y) => x - y)
        if (!v.length) throw new Error('no numbers')
        const mid = Math.floor(v.length / 2)
        return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
      }
      case 'MODE': {
        const counts = new Map()
        numsOf(a).forEach((x) => counts.set(x, (counts.get(x) || 0) + 1))
        let best = null
        let bestCount = 1
        counts.forEach((count, x) => {
          if (count > bestCount) {
            best = x
            bestCount = count
          }
        })
        if (best === null) throw new Error('no mode')
        return best
      }
      case 'VAR':
      case 'STDEV': {
        const v = numsOf(a)
        if (v.length < 2) throw new Error('need 2 numbers')
        const mean = v.reduce((x, y) => x + y, 0) / v.length
        const variance = v.reduce((x, y) => x + (y - mean) ** 2, 0) / (v.length - 1)
        return name === 'VAR' ? variance : Math.sqrt(variance)
      }
      case 'ROUND': {
        const f = Math.pow(10, n(1))
        return roundAway(n(0) * f) / f
      }
      case 'ROUNDUP': {
        const f = Math.pow(10, n(1))
        return (Math.sign(n(0)) * Math.ceil(Math.abs(n(0)) * f)) / f
      }
      case 'ROUNDDOWN': {
        const f = Math.pow(10, n(1))
        return (Math.sign(n(0)) * Math.floor(Math.abs(n(0)) * f)) / f
      }
      case 'ABS': return Math.abs(n(0))
      case 'SQRT': {
        if (n(0) < 0) throw new Error('negative sqrt')
        return Math.sqrt(n(0))
      }
      case 'POWER': return Math.pow(n(0), n(1))
      case 'MOD': {
        const d = n(1)
        if (d === 0) throw new Error('mod by zero')
        return ((n(0) % d) + d) % d
      }
      case 'INT': return Math.floor(n(0))
      case 'CEILING': {
        const s = n(1, 1)
        return s === 0 ? 0 : Math.ceil(n(0) / s) * s
      }
      case 'FLOOR': {
        const s = n(1, 1)
        return s === 0 ? 0 : Math.floor(n(0) / s) * s
      }
      case 'PI': return Math.PI

      // ----- logical -----
      case 'AND': return flat(a).every(truthy)
      case 'OR': return flat(a).some(truthy)
      case 'NOT': return !truthy(a[0])

      // ----- conditional -----
      case 'SUMIF':
      case 'COUNTIF':
      case 'AVERAGEIF': {
        const rng = flat([a[0]])
        const target = name === 'COUNTIF' ? null : flat([a[2] === undefined ? a[0] : a[2]])
        let total = 0
        let count = 0
        let numeric = 0
        rng.forEach((v, k) => {
          if (!matches(v, a[1])) return
          count++
          if (target && typeof target[k] === 'number') {
            total += target[k]
            numeric++
          }
        })
        if (name === 'COUNTIF') return count
        if (name === 'SUMIF') return total
        if (!numeric) throw new Error('nothing to average')
        return total / numeric
      }

      // ----- text -----
      case 'CONCAT':
      case 'CONCATENATE': return flat(a).map(toText).join('')
      case 'LEN': return toText(a[0]).length
      case 'UPPER': return toText(a[0]).toUpperCase()
      case 'LOWER': return toText(a[0]).toLowerCase()
      case 'TRIM': return toText(a[0]).trim().replace(/\s+/g, ' ')
      case 'LEFT': return toText(a[0]).slice(0, Math.max(0, n(1, 1)))
      case 'RIGHT': {
        const s = toText(a[0])
        return s.slice(Math.max(0, s.length - Math.max(0, n(1, 1))))
      }
      case 'MID': {
        const start = Math.max(1, n(1, 1))
        return toText(a[0]).slice(start - 1, start - 1 + Math.max(0, n(2, 0)))
      }

      // ----- lookup -----
      case 'VLOOKUP': {
        if (!isRange(a[1])) throw new Error('range needed')
        const rows = a[1].rows
        const col = n(2, 1)
        if (col < 1 || col > rows[0].length) throw new Error('column out of range')
        const exact = a[3] !== undefined && !truthy(a[3])
        const idx = findIndex(rows.map((r) => r[0]), a[0], exact)
        if (idx < 0) throw new Error('not found')
        return rows[idx][col - 1]
      }
      case 'HLOOKUP': {
        if (!isRange(a[1])) throw new Error('range needed')
        const rows = a[1].rows
        const rowNo = n(2, 1)
        if (rowNo < 1 || rowNo > rows.length) throw new Error('row out of range')
        const exact = a[3] !== undefined && !truthy(a[3])
        const idx = findIndex(rows[0], a[0], exact)
        if (idx < 0) throw new Error('not found')
        return rows[rowNo - 1][idx]
      }
      case 'INDEX': {
        if (!isRange(a[0])) throw new Error('range needed')
        const rows = a[0].rows
        let r = n(1, 1)
        let c = n(2, 1)
        if (rows.length === 1 && a[2] === undefined) {
          c = r
          r = 1
        }
        const row = rows[r - 1]
        if (!row || c < 1 || c > row.length) throw new Error('out of range')
        return row[c - 1]
      }
      case 'MATCH': {
        const type = n(2, 1)
        const idx = findIndex(flat([a[1]]), a[0], type === 0)
        if (idx < 0) throw new Error('not found')
        return idx + 1
      }

      // ----- date -----
      case 'TODAY': return todayText()
      case 'NOW': return nowText()

      default: throw new Error('unknown function')
    }
  }

  const ev = (node) => {
    switch (node.t) {
      case 'lit': return node.v
      case 'ref': return rawCell(node.ref)
      case 'range': return rangeValues(node.range)
      case 'neg': return -toNum(ev(node.e))
      case 'pct': return toNum(ev(node.e)) / 100
      case 'bin': return binary(node.op, ev(node.l), ev(node.r))
      case 'fn': return callFn(node.name, node.args)
      default: throw new Error('bad formula')
    }
  }

  try {
    const ast = parseFormula(tokenizeFormula(formula.trim().slice(1)))
    const value = ev(ast)
    if (isRange(value)) return '#ERROR'
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : '#ERROR'
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return value === null || value === undefined ? '' : String(value)
  } catch {
    return '#ERROR'
  }
}

// Re-calculates every formula cell of one table (3 passes so formulas that use other formulas settle)
function recomputeSheet(table) {
  for (let pass = 0; pass < 3; pass++) {
    table.querySelectorAll('td[data-formula]').forEach((td) => {
      td.textContent = evaluateFormula(table, td.dataset.formula)
    })
  }
}

// What the formula bar shows for a cell: its label (B3) and its formula / value
function describeCell(td) {
  const row = td.parentElement ? td.parentElement.rowIndex : 0
  return {
    ref: colLetter(Math.max(0, td.cellIndex - 1)) + row,
    content: td.dataset.formula || td.textContent,
  }
}

// ---------------------------------------------------------------
// AUTHORSHIP HELPERS
// Every "unit" (paragraph / heading / list item / table cell / code block) that a
// person adds or changes is stamped with that person's id, name and colour.
// ---------------------------------------------------------------
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'UL', 'OL', 'PRE', 'TABLE', 'HR', 'BLOCKQUOTE'])

// Loose text typed straight into the editor gets wrapped in a <div> (so it can carry a colour)
function wrapLooseNodes(root) {
  const sel = window.getSelection()
  const range = sel && sel.rangeCount && root.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
  let run = null
  let moved = false
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)) {
      run = null
      return
    }
    if (node.nodeType === 8) return
    if (node.nodeType === 3 && !node.textContent.trim() && !run) return
    if (!run) {
      run = document.createElement('div')
      root.insertBefore(run, node)
    }
    run.appendChild(node)
    moved = true
  })
  if (moved && range && range.startContainer !== root && range.endContainer !== root) {
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

// The pieces of the document that can carry an author colour
function authorUnits(root) {
  const out = []
  Array.from(root.children).forEach((node) => {
    const tag = node.tagName
    if (tag === 'UL' || tag === 'OL') Array.from(node.children).forEach((li) => out.push(li))
    else if (tag === 'TABLE') node.querySelectorAll('td').forEach((td) => out.push(td))
    else if (tag !== 'HR' && tag !== 'BR') out.push(node)
  })
  return out
}

const unitSig = (unit) => `${unit.tagName}|${unit.innerHTML}`

// Turns an image file into a small JPEG data URL so it can live inside the document
function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX_WIDTH = 720
        const scale = Math.min(1, MAX_WIDTH / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff' // transparent PNGs get a white background
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ---------------------------------------------------------------
// LIVE-SYNC HELPERS
// Changes travel as small edits and are applied to the page piece by piece,
// so the whole document is never re-sent or re-drawn for one typed letter.
// ---------------------------------------------------------------
const LOCAL_ORIGIN = 'editor-input' // marks Yjs changes that came from this editor's own typing

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code) => code >= 0xdc00 && code <= 0xdfff

// Writes only the part of the text that changed (not delete-everything + insert-everything)
function syncTextToYjs(ytext, ydoc, next) {
  const cur = ytext.toString()
  if (cur === next) return
  const max = Math.min(cur.length, next.length)
  let p = 0
  while (p < max && cur.charCodeAt(p) === next.charCodeAt(p)) p++
  let s = 0
  while (s < max - p && cur.charCodeAt(cur.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++
  // never cut an emoji (surrogate pair) in half
  if (p > 0 && isHighSurrogate(cur.charCodeAt(p - 1))) p--
  if (s > 0 && isLowSurrogate(cur.charCodeAt(cur.length - s))) s--
  ydoc.transact(() => {
    const removeCount = cur.length - p - s
    if (removeCount > 0) ytext.delete(p, removeCount)
    const added = next.slice(p, next.length - s)
    if (added) ytext.insert(p, added)
  }, LOCAL_ORIGIN)
}

// Caret position as "number of text characters before it"
function textOffsetOf(root, node, offset) {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(node, offset)
  return range.toString().length
}

// The opposite: where in the page is the n-th text character?
function pointAtTextOffset(root, target) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = target
  let last = null
  while (walker.nextNode()) {
    const node = walker.currentNode
    last = node
    if (remaining <= node.nodeValue.length) return { node, offset: remaining }
    remaining -= node.nodeValue.length
  }
  return last ? { node: last, offset: last.nodeValue.length } : { node: root, offset: root.childNodes.length }
}

// Makes the editor show `html`, replacing only the top-level blocks that really differ.
// Untouched paragraphs, pictures and spreadsheets stay exactly as they are (no flicker).
function patchChildren(el, html) {
  const box = document.createElement('template')
  box.innerHTML = html
  const next = Array.from(box.content.childNodes)
  const cur = Array.from(el.childNodes)

  let start = 0
  while (start < cur.length && start < next.length && cur[start].isEqualNode(next[start])) start++
  let endCur = cur.length
  let endNext = next.length
  while (endCur > start && endNext > start && cur[endCur - 1].isEqualNode(next[endNext - 1])) {
    endCur--
    endNext--
  }

  const before = endCur < cur.length ? cur[endCur] : null
  for (let k = start; k < endCur; k++) el.removeChild(cur[k])
  for (let k = start; k < endNext; k++) el.insertBefore(next[k], before)
}

// Shows shared text from the room in the editor and keeps the reader's caret where it was
function applySharedHtml(el, html) {
  if (el.innerHTML === html) return

  const sel = window.getSelection()
  let saved = null
  if (
    document.activeElement === el &&
    sel &&
    sel.rangeCount &&
    el.contains(sel.anchorNode) &&
    el.contains(sel.focusNode)
  ) {
    saved = {
      oldText: el.textContent,
      anchor: textOffsetOf(el, sel.anchorNode, sel.anchorOffset),
      focus: textOffsetOf(el, sel.focusNode, sel.focusOffset),
    }
  }

  patchChildren(el, html)

  if (!saved) return
  const after = window.getSelection()
  const kept =
    after &&
    after.rangeCount &&
    after.anchorNode !== el &&
    el.contains(after.anchorNode) &&
    el.contains(after.focusNode)
  if (kept) return // the caret sits in a block that was not touched

  // The caret's block was replaced: put the caret back at the same place in the text
  const oldText = saved.oldText
  const newText = el.textContent
  const max = Math.min(oldText.length, newText.length)
  let p = 0
  while (p < max && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++
  let s = 0
  while (s < max - p && oldText.charCodeAt(oldText.length - 1 - s) === newText.charCodeAt(newText.length - 1 - s)) s++
  const shift = (offset) => {
    if (offset <= p) return offset
    if (offset >= oldText.length - s) return offset + (newText.length - oldText.length)
    return newText.length - s // it was inside the changed part: end of the new text
  }
  const a = pointAtTextOffset(el, Math.max(0, shift(saved.anchor)))
  const f = pointAtTextOffset(el, Math.max(0, shift(saved.focus)))
  after.setBaseAndExtent(a.node, a.offset, f.node, f.offset)
}

// roomCode decides which live "room" this editor syncs to - everyone using the
// same room code edits the same shared document.
// role: 'host' (created the room) or 'collab' (joined it - needs the host's approval)
function Editor({
  initialHtml = '',
  onChange,
  onRemoteChange,
  onYjsReady,
  onPresenceChange,
  onNotify,
  onAccessChange,
  pendingRoomMembers = [],
  user,
  roomCode = '',
  role = 'host',
  documentId = 'shared-doc',
  documentTitle = 'Untitled Document',
  initialToolState = null,
  onToolStateChange,
}) {
  const roomName = roomCode ? `syncdoc-room-${roomCode}` : documentId

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const onRemoteChangeRef = useRef(onRemoteChange) // always the newest callbacks
  onRemoteChangeRef.current = onRemoteChange
  const onPresenceRef = useRef(onPresenceChange)
  onPresenceRef.current = onPresenceChange
  const onNotifyRef = useRef(onNotify)
  onNotifyRef.current = onNotify
  const onAccessRef = useRef(onAccessChange)
  onAccessRef.current = onAccessChange
  const pendingRoomMembersRef = useRef(pendingRoomMembers)
  pendingRoomMembersRef.current = pendingRoomMembers

  const ydocRef = useRef(null)
  const ytextRef = useRef(null)
  const providerRef = useRef(null)
  const lastHtmlRef = useRef('') // last html we sent/received, to skip pointless syncs
  const savedRangeRef = useRef(null) // where the caret was, for toolbar buttons / file dialogs
  const currentCellRef = useRef(null) // spreadsheet cell the caret is in
  const activeCellRef = useRef(null) // last spreadsheet cell used (kept for the formula bar)
  const codeLangRef = useRef(initialToolState?.codeLang || 'JavaScript')

  const accessRef = useRef(role === 'host' ? 'granted' : 'pending') // 'granted' | 'pending' | 'denied'
  const selfRef = useRef({ id: 'guest', name: 'Guest', color: HOST_COLOR, role: 'host' })
  const unitSigsRef = useRef([]) // fingerprints of every unit, to see which ones a person changed
  const decideRef = useRef(null) // host: (request, allow) => approve / deny a join request
  const notifiedRef = useRef(new Set()) // join requests the host was already told about

  // Tool state - lifted from toolbar to here for persistence & sharing
  const init = initialToolState || {}
  const [zoom, setZoom] = useState(init.zoom || 100)
  const [codeLang, setCodeLang] = useState(init.codeLang || 'JavaScript')
  const [activeTab, setActiveTab] = useState(init.activeTab || 'photo')
  const [listStyle, setListStyle] = useState(init.listStyle || 'bullet')
  const [textAlign, setTextAlign] = useState(init.textAlign || 'left')
  const [access, setAccess] = useState(role === 'host' ? 'granted' : 'pending')
  const [pending, setPending] = useState([]) // host: people waiting to be let in
  const [people, setPeople] = useState([]) // everyone allowed in the room (for the colour key)
  const [synced, setSynced] = useState(false) // true once the room's saved state (incl. approvals) has arrived
  const [sheetCell, setSheetCell] = useState(null) // { ref, content } shown in the formula bar
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    if (role !== 'host') return
    setPending(pendingRoomMembers.map((request) => ({
      ...request,
      color: colorFor(request.name || ''),
      clientId: `room-member-${request.id}`,
      req: 0,
    })))
  }, [pendingRoomMembers, role])

  // Yjs shared tool-state map – syncs active tab / list style / align across collaborators
  const ytoolRef = useRef(null)

  const notify = (message, type = 'info') => {
    if (onNotifyRef.current) onNotifyRef.current(message, type)
  }

  // Remember what every unit looks like right now (after loading / receiving content)
  const snapshotUnits = () => {
    const el = editorRef.current
    unitSigsRef.current = el ? authorUnits(el).map(unitSig) : []
  }

  // Stamp the units that changed since the last snapshot with the current person's colour
  const stampAuthorship = () => {
    const el = editorRef.current
    if (!el) return
    const units = authorUnits(el)
    const sigs = units.map(unitSig)
    const prev = unitSigsRef.current

    let start = 0
    while (start < sigs.length && start < prev.length && sigs[start] === prev[start]) start++
    let endCur = sigs.length
    let endPrev = prev.length
    while (endCur > start && endPrev > start && sigs[endCur - 1] === prev[endPrev - 1]) {
      endCur--
      endPrev--
    }

    const pool = new Map()
    for (let k = start; k < endPrev; k++) pool.set(prev[k], (pool.get(prev[k]) || 0) + 1)

    const me = selfRef.current
    for (let k = start; k < endCur; k++) {
      const left = pool.get(sigs[k])
      if (left) {
        pool.set(sigs[k], left - 1) // this unit only moved, it was not changed
        continue
      }
      const unit = units[k]
      unit.setAttribute('data-author', me.id)
      unit.setAttribute('data-author-name', me.name)
      unit.setAttribute('title', `Edited by ${me.name}`)
      unit.style.setProperty('--author-color', me.color)
    }
    unitSigsRef.current = sigs
  }

  // Set up the shared Yjs document + WebSocket connection (again whenever the room changes)
  useEffect(() => {
    setSynced(false)
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(WS_URL, roomName, ydoc, {
      params: { token: getToken() || '' },
      // A 4403 response means MongoDB says this account was denied. Pending users
      // still receive 1008 and keep retrying so approval can let them in later.
      shouldReconnect: (event) => event.code !== 4403,
    })
    if (onYjsReady) {
     onYjsReady({ ydoc, provider })
    }
    const ytext = ydoc.getText('content')
    const approvals = ydoc.getMap('approvals') // userId -> { status: 'approved' | 'denied', ... }
    const colors = ydoc.getMap('colors') // userId -> colour (one per person, no repeats)
    const ytool = ydoc.getMap('toolState') // shared toolbar state across collaborators

    ydocRef.current = ydoc
    ytextRef.current = ytext
    ytoolRef.current = ytool
    providerRef.current = provider

    const isHost = role === 'host'
    const myName = (user && user.name) || 'Guest'
    const myId = String((user && (user.id || user._id || user.email || user.name)) || 'guest')
    const myRequest = Date.now() // identifies this join attempt
    let synced = false

    selfRef.current = {
      id: myId,
      name: myName,
      color: isHost ? HOST_COLOR : colorFor(myName),
      role: isHost ? 'host' : 'collab',
    }
    accessRef.current = isHost ? 'granted' : 'pending'

    // Show the content loaded from MongoDB right away, so the document is
    // visible (and safe) even before / without the live-sync connection.
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml
      lastHtmlRef.current = editorRef.current.innerHTML
    }
    snapshotUnits()

    // Put the shared text on screen (only people who are allowed in see it)
    const loadSharedIntoDom = () => {
      const el = editorRef.current
      if (!el || ytext.length === 0) return
      const html = ytext.toString()
      if (el.innerHTML !== html) {
        applySharedHtml(el, html)
        lastHtmlRef.current = el.innerHTML
        snapshotUnits()
        if (onRemoteChangeRef.current) {
          onRemoteChangeRef.current({ html: el.innerHTML, text: el.innerText })
        }
      }
    }

    // ---- who is in the room (live collaborator list) ----
    const publishSelf = () => {
      provider.awareness.setLocalStateField('user', { ...selfRef.current })
    }
    publishSelf()
    if (!isHost) provider.awareness.setLocalStateField('joinRequest', myRequest)

    let lastPeopleSig = '' // what was last reported, so an unchanged list is never re-sent
    let lastWaitingSig = ''

    const emitPresence = () => {
      if (!isHost && accessRef.current === 'denied') {
        if (lastPeopleSig !== '[]') {
          lastPeopleSig = '[]'
          setPeople([])
          if (onPresenceRef.current) onPresenceRef.current([])
        }
        return
      }

      // One entry per ACCOUNT (userId), never per socket: awareness has one state per
      // connection, so a reconnect / second tab / lingering old state of the same
      // person would otherwise show up as a second collaborator.
      const byUser = new Map() // userId -> person shown in the list
      const waitingByUser = new Map() // userId -> join request shown to the host
      provider.awareness.getStates().forEach((state, clientId) => {
        const u = state.user
        if (!u || u.id === undefined || u.id === null) return
        const isSelf = clientId === provider.awareness.clientID
        if (!isSelf && u.id === myId) return // another connection of MY account: already listed as me
        const rec = approvals.get(u.id)
        const approved = rec && rec.status === 'approved'
        if (u.role === 'host' || approved || isSelf) {
          const prev = byUser.get(u.id)
          const keepPrev = prev && (prev.isSelf || (!isSelf && (prev.role === 'host' || u.role !== 'host')))
          if (!keepPrev) byUser.set(u.id, { id: u.id, name: u.name, color: u.color, role: u.role, isSelf })
        } else if (isHost) {
          const declinedThisTime = rec && rec.status === 'denied' && rec.req === state.joinRequest
          if (!declinedThisTime) {
            const prev = waitingByUser.get(u.id)
            if (!prev || (state.joinRequest || 0) > (prev.req || 0)) {
              waitingByUser.set(u.id, { clientId, id: u.id, name: u.name, color: u.color, req: state.joinRequest })
            }
          }
        }
      })
      const list = Array.from(byUser.values())
      const waiting = Array.from(waitingByUser.values())
      list.sort((a, b) => (b.role === 'host') - (a.role === 'host')) // host first
      const peopleSig = JSON.stringify(list.map((p) => [p.id, p.name, p.color, p.role, p.isSelf]))
      if (peopleSig !== lastPeopleSig) {
        lastPeopleSig = peopleSig
        setPeople(list)
        if (onPresenceRef.current) onPresenceRef.current(list)
      }
      if (isHost) {
        const storedRequests = pendingRoomMembersRef.current.map((request) => ({
          id: String(request.id),
          name: request.name || 'Collaborator',
          color: colorFor(request.name || ''),
          clientId: `room-member-${request.id}`,
          req: 0,
        }))
        const combinedWaiting = new Map(storedRequests.map((request) => [request.id, request]))
        waiting.forEach((request) => {
          if (!combinedWaiting.has(request.id)) combinedWaiting.set(request.id, request)
        })
        const pendingRequests = Array.from(combinedWaiting.values())
        const waitingSig = JSON.stringify(pendingRequests.map((p) => [p.clientId, p.id, p.name, p.color, p.req]))
        if (waitingSig !== lastWaitingSig) {
          lastWaitingSig = waitingSig
          setPending(pendingRequests)
        }
        pendingRequests.forEach((p) => {
          const key = `${p.id}:${p.req}`
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key)
            notify(`${p.name} wants to join this room`)
          }
        })
      }
    }

    const onConnectionClosed = (event) => {
      if (isHost || event?.code !== 4403) return

      accessRef.current = 'denied'
      setAccess('denied')
      setSynced(true)
      if (onAccessRef.current) onAccessRef.current('denied')
      emitPresence()
      notify('Your access to this room was denied by the host. The editor is read-only.', 'error')
    }
    provider.on('closed', onConnectionClosed)

    // ---- the host's answer to a join request ----
    const evalAccess = () => {
      let next = 'granted'
      if (!isHost) {
        const rec = approvals.get(myId)
        if (rec && rec.status === 'approved') next = 'granted'
        else if (rec && rec.status === 'denied' && rec.req === myRequest) next = 'denied'
        else next = 'pending'
      }
      const before = accessRef.current
      accessRef.current = next
      setAccess(next)
      if (onAccessRef.current) onAccessRef.current(next)
      if (next === 'granted' && before !== 'granted') {
        loadSharedIntoDom()
        notify('The host approved you - you can edit now', 'success')
      }
      if (next === 'denied' && before !== 'denied') notify('The host declined your request', 'error')
    }

    decideRef.current = async (request, allow) => {
      try {
        await updateRoomMemberStatus(roomCode, request.id, allow ? 'approved' : 'denied')
      } catch (error) {
        notify(error.message || `Could not ${allow ? 'approve' : 'deny'} this room request`, 'error')
        return
      }

      approvals.set(
        request.id,
        allow
          ? { status: 'approved', name: request.name, at: Date.now() }
          : { status: 'denied', name: request.name, req: request.req, at: Date.now() }
      )
      if (allow) notify(`${request.name} can now edit this document`, 'success')
    }

    // ---- one colour per person ----
    const resolveColor = () => {
      const mine = colors.get(myId)
      let want
      if (isHost) {
        want = HOST_COLOR
      } else {
        const used = new Set()
        let duplicate = false
        colors.forEach((c, id) => {
          if (id === myId) return
          used.add(c)
          if (c === mine && id < myId) duplicate = true
        })
        want = mine && !duplicate ? mine : USER_COLORS.find((c) => !used.has(c)) || colorFor(myName)
      }
      if (want !== mine) colors.set(myId, want)
      if (selfRef.current.color !== want) {
        selfRef.current.color = want
        publishSelf()
      }
    }

    const onApprovals = () => {
      evalAccess()
      emitPresence()
    }
    const onColors = () => {
      if (synced) resolveColor()
      emitPresence()
    }

    provider.awareness.on('change', emitPresence)
    approvals.observe(onApprovals)
    colors.observe(onColors)
    evalAccess()
    emitPresence()

    // Sync shared tool state (activeTab, listStyle, textAlign) across collaborators
    const onToolState = () => {
      const remoteTab = ytool.get('activeTab')
      const remoteList = ytool.get('listStyle')
      const remoteAlign = ytool.get('textAlign')
      const remoteZoom = ytool.get('zoom')
      const remoteCodeLang = ytool.get('codeLang')
      if (remoteTab && ['photo', 'code', 'sheet'].includes(remoteTab)) setActiveTab(remoteTab)
      if (remoteList && ['bullet', 'number', 'roman'].includes(remoteList)) setListStyle(remoteList)
      if (remoteAlign && ['left', 'center', 'right', 'justify'].includes(remoteAlign)) setTextAlign(remoteAlign)
      if (typeof remoteZoom === 'number' && remoteZoom >= 50 && remoteZoom <= 200) setZoom(remoteZoom)
      if (typeof remoteCodeLang === 'string' && remoteCodeLang) {
        codeLangRef.current = remoteCodeLang
        setCodeLang(remoteCodeLang)
      }
    }
    ytool.observe(onToolState)

    // Whenever the shared text changes (from ANY user, including this one),
    // reflect it in the DOM - but skip re-rendering if this change came
    // from our own typing (we already updated the DOM directly).
    const updateDOM = (event, transaction) => {
      if (transaction && transaction.origin === LOCAL_ORIGIN) return // our own typing: the page already shows it
      if (accessRef.current !== 'granted') return // not approved yet: keep the shared text hidden
      const el = editorRef.current
      if (el) {
        const newHtml = ytext.toString()
const cleanHtml = DOMPurify.sanitize(newHtml)

if (el.innerHTML !== cleanHtml) {
  applySharedHtml(el, cleanHtml)
  lastHtmlRef.current = el.innerHTML
  snapshotUnits()
          if (onRemoteChangeRef.current) {
            onRemoteChangeRef.current({ html: el.innerHTML, text: el.innerText })
          }
        }
      }
    }

    ytext.observe(updateDOM)

    // Once connected, if the shared doc already has content, load it.
    // If it's empty and we have initialHtml, seed it (the host does the seeding).
    provider.on('sync', (isSynced) => {
      if (isSynced) {
        synced = true
        setSynced(true)
        if (ytext.length > 0) {
          if (accessRef.current === 'granted') loadSharedIntoDom()
        } else if (initialHtml && isHost) {
          // Seed the shared doc from MongoDB (e.g. after the backend restarted).
          // The seed is built with a fixed clientID, so if two users do this at the
          // same moment, Yjs sees identical edits and merges them into ONE copy.
          const seed = new Y.Doc()
          seed.clientID = 0
          seed.getText('content').insert(0, initialHtml)
          Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seed))
          seed.destroy()
        }
        // Seed shared toolbar state from MongoDB on first sync, then apply any remote values.
        if (isHost) {
          const seedToolState = {
            activeTab,
            listStyle,
            textAlign,
            codeLang,
            zoom,
          }
          Object.entries(seedToolState).forEach(([key, value]) => {
            if (ytool.get(key) === undefined) ytool.set(key, value)
          })
        }
        onToolState()
        resolveColor()
        evalAccess()
        emitPresence()
      }
    })

    return () => {
      provider.off('closed', onConnectionClosed)
      provider.awareness.off('change', emitPresence)
      approvals.unobserve(onApprovals)
      colors.unobserve(onColors)
      ytool.unobserve(onToolState)
      ytext.unobserve(updateDOM)
      decideRef.current = null
      if (onYjsReady) {
       onYjsReady(null)
      }
      provider.destroy()
      ydoc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName])

  // ---------------------------------------------------------------
  // CARET HELPERS
  // ---------------------------------------------------------------
  const saveSelection = () => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (el && sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    const el = editorRef.current
    if (!el) return
    const sel = window.getSelection()
    // The caret is already inside the editor: keep it exactly where it is
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      if (document.activeElement !== el) el.focus()
      return
    }
    el.focus()
    if (savedRangeRef.current && el.contains(savedRangeRef.current.startContainer)) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    } else {
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false) // no saved caret: insert at the end
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  // The element the caret is currently in (or was last in)
  const getCaretElement = () => {
    const el = editorRef.current
    const sel = window.getSelection()
    let node = null
    if (el && sel && sel.rangeCount && el.contains(sel.anchorNode)) node = sel.anchorNode
    else if (savedRangeRef.current) node = savedRangeRef.current.startContainer
    if (!node) return null
    return node.nodeType === 1 ? node : node.parentElement
  }

  const placeCaretAtEnd = (node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // ---------------------------------------------------------------
  // CORE: every change goes through here
  // ---------------------------------------------------------------
  const handleInput = () => {
    const el = editorRef.current
    if (!el) return
    if (accessRef.current !== 'granted') return // waiting for the host: read-only

    // After deleting everything, browsers leave a stray <br>, which hides
    // the placeholder. Clearing it brings the placeholder back.
    if (el.innerHTML === '<br>') {
      el.innerHTML = ''
    }

    // Mark whatever this person just added or changed with their colour
    wrapLooseNodes(el)
    stampAuthorship()

    lastHtmlRef.current = el.innerHTML

    // Push this local change into the shared Yjs document so it syncs
    // to every other connected user.
    const ytext = ytextRef.current
    const ydoc = ydocRef.current
    if (ytext && ydoc) syncTextToYjs(ytext, ydoc, el.innerHTML)

    // Keep the formula bar in step with the cell being typed in
    const td = currentCellRef.current
    if (td && el.contains(td)) setSheetCell(describeCell(td))

    if (onChange) {
      onChange({ html: el.innerHTML, text: el.innerText })
    }
  }

  const handleFormat = (command, arg = null) => {
    // Handle our custom Roman list command
    if (command === 'insertRomanList') {
      handleInsertRomanList()
      return
    }
    // formatBlock wants "<h1>" (Firefox rejects a bare "H1")
    if (command === 'formatBlock' && arg && !arg.startsWith('<')) arg = `<${arg}>`
    restoreSelection()
    document.execCommand(command, false, arg)
    editorRef.current.focus()
    // execCommand fires an "input" event by itself, so handleInput runs next.
  }

  // ---------------------------------------------------------------
  // ROMAN NUMBERING LIST
  // ---------------------------------------------------------------
  const handleInsertRomanList = () => {
    restoreSelection()
    const el = editorRef.current
    if (!el) return

    const sel = window.getSelection()
    const node = sel && sel.anchorNode
    const caretEl = node ? (node.nodeType === 1 ? node : node.parentElement) : null

    // Find closest list ancestor inside the editor
    const existingOl = caretEl && caretEl.closest ? caretEl.closest('ol') : null
    const existingUl = caretEl && caretEl.closest ? caretEl.closest('ul') : null

    if (existingOl && el.contains(existingOl)) {
      const isRoman = existingOl.getAttribute('type') === 'I' || existingOl.classList.contains('roman-list')
      if (isRoman) {
        // toggle off: convert to plain ordered list
        existingOl.removeAttribute('type')
        existingOl.classList.remove('roman-list')
        existingOl.style.removeProperty('list-style-type')
      } else {
        // convert numbered list -> Roman
        existingOl.setAttribute('type', 'I')
        existingOl.classList.add('roman-list')
        existingOl.style.listStyleType = 'upper-roman'
      }
    } else if (existingUl && el.contains(existingUl)) {
      // Convert bullet list to Roman ordered list
      const ol = document.createElement('ol')
      ol.setAttribute('type', 'I')
      ol.classList.add('roman-list')
      ol.style.listStyleType = 'upper-roman'
      while (existingUl.firstChild) ol.appendChild(existingUl.firstChild)
      existingUl.parentNode.replaceChild(ol, existingUl)
      // Place caret inside the new list
      if (ol.firstChild) placeCaretAtEnd(ol.firstChild)
    } else {
      // No list: create a Roman numbered list via insertOrderedList, then modify it
      document.execCommand('insertOrderedList', false, null)
      // Now find the new <ol> and convert it to Roman
      const newSel = window.getSelection()
      const newNode = newSel && newSel.anchorNode
      const newEl = newNode ? (newNode.nodeType === 1 ? newNode : newNode.parentElement) : null
      const newOl = newEl && newEl.closest ? newEl.closest('ol') : null
      if (newOl && el.contains(newOl)) {
        newOl.setAttribute('type', 'I')
        newOl.classList.add('roman-list')
        newOl.style.listStyleType = 'upper-roman'
      }
    }

    el.focus()
    handleInput()
  }

  const insertHtml = (html) => {
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    // "input" event follows -> handleInput
  }

  // ---------------------------------------------------------------
  // PHOTOGRAPH
  // ---------------------------------------------------------------
  const handlePhotoClick = () => {
    saveSelection()
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const handlePhotoSelected = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // lets the same file be picked again later
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('Please choose an image file', 'error')
      return
    }
    try {
      const dataUrl = await readImageAsDataUrl(file)
      insertHtml(`<p><img src="${dataUrl}" alt="${escapeHtml(file.name)}"></p><p><br></p>`)
    } catch {
      notify('Could not read that image', 'error')
    }
  }

  // ---------------------------------------------------------------
  // CODE BLOCK
  // ---------------------------------------------------------------
  const handleInsertCode = () => {
    saveSelection()
    const lang = codeLangRef.current
    const selected = window.getSelection().toString()
    const body = escapeHtml(selected || `// Write your ${lang} code here`)
    insertHtml(`<pre class="code-block" data-lang="${lang}">${body}</pre><p><br></p>`)
  }

  const handleCodeLanguage = (lang) => {
    codeLangRef.current = lang
    setCodeLang(lang)
    pushToolState({ codeLang: lang })
    // If the caret is inside a code block, switch that block's language too
    const el = getCaretElement()
    const pre = el && el.closest ? el.closest('pre') : null
    if (pre && editorRef.current.contains(pre)) {
      pre.setAttribute('data-lang', lang)
      handleInput()
    }
  }

  // ---------------------------------------------------------------
  // TOOL STATE PERSISTENCE (Yjs + MongoDB via parent)
  // ---------------------------------------------------------------
  const pushToolState = useCallback((partial) => {
    const ytool = ytoolRef.current
    if (ytool) {
      const ydoc = ydocRef.current
      if (ydoc) {
        ydoc.transact(() => {
          Object.entries(partial).forEach(([key, value]) => ytool.set(key, value))
        })
      }
    }
    if (onToolStateChange) onToolStateChange(partial)
  }, [onToolStateChange])

  const handleActiveTabChange = (tab) => {
    setActiveTab(tab)
    pushToolState({ activeTab: tab })
  }

  const handleListStyleChange = (style) => {
    setListStyle(style)
    pushToolState({ listStyle: style })
  }

  const handleTextAlignChange = (align) => {
    setTextAlign(align)
    pushToolState({ textAlign: align })
  }

  const handleZoomChange = (nextZoom) => {
    setZoom(nextZoom)
    pushToolState({ zoom: nextZoom })
  }

  // ---------------------------------------------------------------
  // PDF EXPORT
  // ---------------------------------------------------------------
  const handleExportPdf = async () => {
    if (exportingPdf) return
    if (accessRef.current !== 'granted') {
      notify('You need edit access to export this document', 'error')
      return
    }
    setExportingPdf(true)
    try {
      const el = editorRef.current
      const currentHtml = el ? el.innerHTML : lastHtmlRef.current
      const result = await exportDocumentPdf(documentId, {
        html: currentHtml,
        title: documentTitle || 'Untitled Document',
        toolState: { activeTab, listStyle, textAlign, codeLang, zoom },
      })
      // Trigger download in the browser
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(documentTitle || 'document').replace(/[\\/:*?"<>|]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 1000)
      notify('PDF exported successfully!', 'success')
    } catch (err) {
      notify(`PDF export failed: ${err.message}`, 'error')
    } finally {
      setExportingPdf(false)
    }
  }

  // ---------------------------------------------------------------
  // SPREADSHEET
  // ---------------------------------------------------------------
  const handleInsertSheet = () => {
    saveSelection()
    insertHtml(buildSheetHtml(6, 5))
    notify('Spreadsheet added. Type = in a cell, or use the Formula Bar, e.g. =SUM(A1:A3)')
  }

  const handleSheetAction = (action) => {
    if (accessRef.current !== 'granted') {
      notify('You can edit once the host approves you', 'error')
      return
    }
    const el = getCaretElement()
    const table = el && el.closest ? el.closest('table.sheet') : null
    if (!table || !editorRef.current.contains(table)) {
      notify('Click inside a spreadsheet cell first', 'error')
      return
    }
    const body = table.tBodies[0]
    const cols = table.rows[0].cells.length

    if (action === 'addRow') {
      const tr = body.insertRow()
      const th = document.createElement('th')
      th.setAttribute('contenteditable', 'false')
      th.textContent = String(body.rows.length)
      tr.appendChild(th)
      for (let i = 1; i < cols; i++) tr.insertCell().innerHTML = '<br>'
    } else if (action === 'addCol') {
      if (cols - 1 >= 26) {
        notify('A spreadsheet can have at most 26 columns (A-Z)', 'error')
        return
      }
      const headRow = table.tHead.rows[0]
      const th = document.createElement('th')
      th.setAttribute('contenteditable', 'false')
      th.textContent = colLetter(headRow.cells.length - 1)
      headRow.appendChild(th)
      for (const row of body.rows) row.insertCell().innerHTML = '<br>'
    }
    handleInput()
  }

  // Formula Bar: put the typed / chosen formula (or value) into the selected cell
  const handleFormulaApply = (text) => {
    if (accessRef.current !== 'granted') {
      notify('You can edit once the host approves you', 'error')
      return
    }
    const el = editorRef.current
    const td = activeCellRef.current
    if (!el || !td || !el.contains(td)) {
      notify('Click inside a spreadsheet cell first', 'error')
      return
    }
    const table = td.closest('table.sheet')
    if (!table) {
      notify('Click inside a spreadsheet cell first', 'error')
      return
    }
    const value = String(text || '').trim()
    if (value.startsWith('=')) {
      td.dataset.formula = value
      td.textContent = value
    } else {
      delete td.dataset.formula
      td.textContent = value
    }
    recomputeSheet(table)
    handleInput()
    setSheetCell(describeCell(td))
  }

  // Finish editing a spreadsheet cell: "=..." becomes a formula, then everything re-calculates
  const commitCell = (td) => {
    const table = td.closest('table.sheet')
    const el = editorRef.current
    if (!table || !el) return
    const text = td.textContent.trim()
    if (text.startsWith('=')) {
      td.dataset.formula = text
    } else if (td.dataset.formula) {
      delete td.dataset.formula // the user typed plain text over a formula
    }
    recomputeSheet(table)
    if (el.innerHTML !== lastHtmlRef.current) handleInput()
  }

  // Watch the caret: leaving a cell commits it, entering a formula cell shows its formula
  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current
      const sel = window.getSelection()
      if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return
      const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement
      const td = node && node.closest ? node.closest('table.sheet td') : null
      const prev = currentCellRef.current
      if (td === prev) return
      currentCellRef.current = td
      if (prev && el.contains(prev)) commitCell(prev)
      if (td && td.dataset.formula) {
        td.textContent = td.dataset.formula
        placeCaretAtEnd(td)
      }
      if (td) {
        activeCellRef.current = td
        setSheetCell(describeCell(td))
      } else {
        activeCellRef.current = null
        setSheetCell(null)
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBlur = () => {
    saveSelection()
    const prev = currentCellRef.current
    if (prev && editorRef.current && editorRef.current.contains(prev)) commitCell(prev)
    currentCellRef.current = null
  }

  // ---------------------------------------------------------------
  // OTHER EVENTS
  // ---------------------------------------------------------------

  // Always paste as plain text so text copied from websites/Word
  // doesn't bring in messy styles and break the document structure.
  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  // Clicking the language badge (top-right corner) of a code block copies its code
  const handleClick = (e) => {
    const pre = e.target.closest ? e.target.closest('pre') : null
    if (!pre) return
    const rect = pre.getBoundingClientRect()
    if (e.clientY - rect.top < 36 && rect.right - e.clientX < 120) {
      const code = pre.innerText
      const done = () => notify('Code copied to clipboard', 'success')
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => { })
    }
  }

  const focusCell = (td) => {
    if (td) placeCaretAtEnd(td)
  }

  const handleKeyDown = (e) => {
    // Spreadsheet navigation: Enter = down, Tab = right (Shift reverses)
    const caretEl = getCaretElement()
    const cell = caretEl && caretEl.closest ? caretEl.closest('table.sheet td') : null
    if (cell && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      const row = cell.parentElement
      let target = null
      if (e.key === 'Enter') {
        const sibling = e.shiftKey ? row.previousElementSibling : row.nextElementSibling
        target = sibling ? sibling.cells[cell.cellIndex] : null
      } else if (e.shiftKey) {
        const prevCell = cell.previousElementSibling
        if (prevCell && prevCell.tagName === 'TD') target = prevCell
        else if (row.previousElementSibling) target = row.previousElementSibling.cells[row.cells.length - 1]
      } else {
        const nextCell = cell.nextElementSibling
        if (nextCell) target = nextCell
        else if (row.nextElementSibling) target = row.nextElementSibling.cells[1]
      }
      focusCell(target)
      return
    }

    const isMod = e.ctrlKey || e.metaKey
    if (!isMod) return

    // Undo / Redo
    if (e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault()
      handleFormat('undo')
      return
    }
    if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
      e.preventDefault()
      handleFormat('redo')
      return
    }

    // Lists
    if (e.shiftKey && e.code === 'Digit8') {
      e.preventDefault()
      handleFormat('insertUnorderedList')
      return
    }
    if (e.shiftKey && e.code === 'Digit7') {
      e.preventDefault()
      handleFormat('insertOrderedList')
      return
    }

    // Headings
    if (e.altKey && e.code === 'Digit1') {
      e.preventDefault()
      handleFormat('formatBlock', 'H1')
      return
    }
    if (e.altKey && e.code === 'Digit2') {
      e.preventDefault()
      handleFormat('formatBlock', 'H2')
      return
    }
  }

  return (
    <div className="editor-wrapper">
      <Toolbar
        onFormat={handleFormat}
        onInsertPhoto={handlePhotoClick}
        onInsertCode={handleInsertCode}
        onCodeLanguage={handleCodeLanguage}
        onInsertSheet={handleInsertSheet}
        onSheetAction={handleSheetAction}
        sheetCell={sheetCell}
        onFormulaApply={handleFormulaApply}
        codeLang={codeLang}
        zoom={zoom}
        onZoomChange={handleZoomChange}
        onExportPdf={handleExportPdf}
        exportingPdf={exportingPdf}
        listStyle={listStyle}
        onListStyleChange={handleListStyleChange}
        textAlign={textAlign}
        onTextAlignChange={handleTextAlignChange}
        activeTab={activeTab}
        onActiveTabChange={handleActiveTabChange}
      />

      {/* Collaborator waiting for the host */}
      {access !== 'granted' && (
        <div className={`access-banner ${access}`} role="status">
          {access === 'denied'
            ? 'Your access to this room was denied. The editor is read-only.'
            : !synced
              ? 'Connecting to the room...'
              : 'Waiting for the host to approve your request to join. You can use Leave to go back to your own document.'}
        </div>
      )}

      {/* Colour key: which colour belongs to which person */}
      {people.length > 1 && (
        <div className="author-legend" aria-label="Who wrote what">
          <span className="author-legend-title">Edits by</span>
          {people.map((p) => (
            <span key={p.id} className={`author-chip ${p.role === 'host' ? 'host' : ''}`}>
              <i style={{ background: p.color }} />
              {p.name}
              {p.role === 'host' ? ' (host)' : ''}
              {p.isSelf ? ' (you)' : ''}
            </span>
          ))}
        </div>
      )}

      <div className="editor-scroll">
        <div
          ref={editorRef}
          className={`editor-content ${access === 'granted' ? '' : 'locked'}`}
          style={{ fontSize: `${(16 * zoom) / 100}px` }}
          contentEditable={access === 'granted'}
          suppressContentEditableWarning
          spellCheck
          data-placeholder="Start typing your document..."
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={handleBlur}
          onClick={handleClick}
          onPaste={handlePaste}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />

      {/* Host only: small corner popup to let people in */}
      {role === 'host' && pending.length > 0 && (
        <div className="join-popup" role="alert">
          <div className="join-popup-title">
            <span className="join-popup-dot" />
            Join requests
          </div>
          {pending.map((p) => (
            <div className="join-popup-item" key={`${p.clientId}-${p.req}`}>
              <span className="join-popup-avatar" style={{ background: p.color }}>
                {initialsOf(p.name)}
              </span>
              <span className="join-popup-text">
                <b>{p.name}</b>
                <small>wants to join this room</small>
              </span>
              <button
                type="button"
                className="join-popup-deny"
                onClick={() => decideRef.current && decideRef.current(p, false)}
              >
                Deny
              </button>
              <button
                type="button"
                className="join-popup-allow"
                onClick={() => decideRef.current && decideRef.current(p, true)}
              >
                Allow
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Editor
