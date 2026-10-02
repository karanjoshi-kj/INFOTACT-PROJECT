import { useRef, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import Toolbar from './Toolbar.jsx'
import './Editor.css'

const WS_URL = 'ws://localhost:1234'

const USER_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']

// Same name -> same colour, so a person keeps their colour everywhere
const colorFor = (name = '') => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return USER_COLORS[h % USER_COLORS.length]
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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

// Calculates things like =SUM(A1:A3)+B2*2 . Supports + - * / ( ) cell refs and
// SUM, AVERAGE (or AVG), MIN, MAX, COUNT.
function evaluateFormula(table, formula) {
  let expr = formula.trim().slice(1).toUpperCase()

  const cellNumber = (ref) => {
    const cell = getSheetCell(table, ref)
    if (!cell) return null
    const v = parseFloat(cell.textContent.replace(/,/g, ''))
    return Number.isNaN(v) ? null : v
  }

  const collect = (arg) => {
    arg = arg.trim()
    const range = arg.match(/^([A-Z])(\d+):([A-Z])(\d+)$/)
    if (range) {
      const c1 = range[1].charCodeAt(0)
      const c2 = range[3].charCodeAt(0)
      const r1 = parseInt(range[2], 10)
      const r2 = parseInt(range[4], 10)
      const out = []
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          const v = cellNumber(String.fromCharCode(c) + r)
          if (v !== null) out.push(v)
        }
      }
      return out
    }
    if (/^[A-Z]\d+$/.test(arg)) {
      const v = cellNumber(arg)
      return v === null ? [] : [v]
    }
    const n = parseFloat(arg)
    return Number.isNaN(n) ? [] : [n]
  }

  expr = expr.replace(/(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(([^()]*)\)/g, (_, fn, args) => {
    const vals = args.split(',').flatMap(collect)
    const sum = vals.reduce((a, b) => a + b, 0)
    let result
    if (fn === 'SUM') result = sum
    else if (fn === 'AVERAGE' || fn === 'AVG') result = vals.length ? sum / vals.length : 0
    else if (fn === 'MIN') result = vals.length ? Math.min(...vals) : 0
    else if (fn === 'MAX') result = vals.length ? Math.max(...vals) : 0
    else result = vals.length
    return `(${result})`
  })

  expr = expr.replace(/\b([A-Z])(\d+)\b/g, (_, c, r) => {
    const v = cellNumber(c + r)
    return `(${v === null ? 0 : v})`
  })

  // Only digits and + - * / ( ) . are allowed past this point, so nothing unsafe can run
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return '#ERROR'
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)()
    if (typeof result !== 'number' || !Number.isFinite(result)) return '#ERROR'
    return String(Math.round(result * 1e6) / 1e6)
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

// roomCode decides which live "room" this editor syncs to - everyone using the
// same room code edits the same shared document.
function Editor({
  initialHtml = '',
  onChange,
  onRemoteChange,
  onPresenceChange,
  onNotify,
  user,
  roomCode = '',
  documentId = 'shared-doc',
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

  const ydocRef = useRef(null)
  const ytextRef = useRef(null)
  const providerRef = useRef(null)
  const isLocalUpdate = useRef(false) // guards against feedback loops
  const lastHtmlRef = useRef('') // last html we sent/received, to skip pointless syncs
  const savedRangeRef = useRef(null) // where the caret was, for toolbar buttons / file dialogs
  const currentCellRef = useRef(null) // spreadsheet cell the caret is in
  const codeLangRef = useRef('JavaScript')

  const [zoom, setZoom] = useState(100)
  const [codeLang, setCodeLang] = useState('JavaScript')

  const notify = (message, type = 'info') => {
    if (onNotifyRef.current) onNotifyRef.current(message, type)
  }

  // Set up the shared Yjs document + WebSocket connection (again whenever the room changes)
  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(WS_URL, roomName, ydoc)
    const ytext = ydoc.getText('content')

    ydocRef.current = ydoc
    ytextRef.current = ytext
    providerRef.current = provider

    // Show the content loaded from MongoDB right away, so the document is
    // visible (and safe) even before / without the live-sync connection.
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml
      lastHtmlRef.current = editorRef.current.innerHTML
    }

    // ---- who is in the room (live collaborator list) ----
    const myName = (user && user.name) || 'Guest'
    provider.awareness.setLocalStateField('user', { name: myName, color: colorFor(myName) })
    const emitPresence = () => {
      const list = []
      provider.awareness.getStates().forEach((state, clientId) => {
        if (state.user) list.push({ id: clientId, name: state.user.name, color: state.user.color })
      })
      if (onPresenceRef.current) onPresenceRef.current(list)
    }
    provider.awareness.on('change', emitPresence)
    emitPresence()

    // Whenever the shared text changes (from ANY user, including this one),
    // reflect it in the DOM - but skip re-rendering if this change came
    // from our own typing (we already updated the DOM directly).
    const updateDOM = () => {
      if (isLocalUpdate.current) {
        isLocalUpdate.current = false
        return
      }
      const el = editorRef.current
      if (el) {
        const newHtml = ytext.toString()
        if (el.innerHTML !== newHtml) {
          el.innerHTML = newHtml
          lastHtmlRef.current = el.innerHTML
          if (onRemoteChangeRef.current) {
            onRemoteChangeRef.current({ html: el.innerHTML, text: el.innerText })
          }
        }
      }
    }

    ytext.observe(updateDOM)

    // Once connected, if the shared doc already has content, load it.
    // If it's empty and we have initialHtml, seed it.
    provider.on('sync', (isSynced) => {
      if (isSynced) {
        const el = editorRef.current
        if (ytext.length > 0) {
          if (el && el.innerHTML !== ytext.toString()) {
            el.innerHTML = ytext.toString()
            lastHtmlRef.current = el.innerHTML
            if (onRemoteChangeRef.current) {
              onRemoteChangeRef.current({ html: el.innerHTML, text: el.innerText })
            }
          }
        } else if (initialHtml) {
          // Seed the shared doc from MongoDB (e.g. after the backend restarted).
          // The seed is built with a fixed clientID, so if two users do this at the
          // same moment, Yjs sees identical edits and merges them into ONE copy.
          const seed = new Y.Doc()
          seed.clientID = 0
          seed.getText('content').insert(0, initialHtml)
          Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seed))
          seed.destroy()
        }
      }
    })

    return () => {
      provider.awareness.off('change', emitPresence)
      ytext.unobserve(updateDOM)
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

    // After deleting everything, browsers leave a stray <br>, which hides
    // the placeholder. Clearing it brings the placeholder back.
    if (el.innerHTML === '<br>') {
      el.innerHTML = ''
    }

    lastHtmlRef.current = el.innerHTML

    // Push this local change into the shared Yjs document so it syncs
    // to every other connected user.
    const ytext = ytextRef.current
    const ydoc = ydocRef.current
    if (ytext && ydoc) {
      isLocalUpdate.current = true
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, el.innerHTML)
      })
    }

    if (onChange) {
      onChange({ html: el.innerHTML, text: el.innerText })
    }
  }

  const handleFormat = (command, arg = null) => {
    // formatBlock wants "<h1>" (Firefox rejects a bare "H1")
    if (command === 'formatBlock' && arg && !arg.startsWith('<')) arg = `<${arg}>`
    restoreSelection()
    document.execCommand(command, false, arg)
    editorRef.current.focus()
    // execCommand fires an "input" event by itself, so handleInput runs next.
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
    // If the caret is inside a code block, switch that block's language too
    const el = getCaretElement()
    const pre = el && el.closest ? el.closest('pre') : null
    if (pre && editorRef.current.contains(pre)) {
      pre.setAttribute('data-lang', lang)
      handleInput()
    }
  }

  // ---------------------------------------------------------------
  // SPREADSHEET
  // ---------------------------------------------------------------
  const handleInsertSheet = () => {
    saveSelection()
    insertHtml(buildSheetHtml(6, 5))
    notify('Spreadsheet added. Type = in a cell for formulas, e.g. =SUM(A1:A3)')
  }

  const handleSheetAction = (action) => {
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
        codeLang={codeLang}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      <div className="editor-scroll">
        <div
          ref={editorRef}
          className="editor-content"
          style={{ fontSize: `${(16 * zoom) / 100}px` }}
          contentEditable
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
    </div>
  )
}

export default Editor