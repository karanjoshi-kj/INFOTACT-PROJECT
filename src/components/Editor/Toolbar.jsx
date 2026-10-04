import { useState, useRef, useEffect } from 'react'
import './Toolbar.css'

// ---- Icons ----
const Svg = ({ children, size = 16, strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const BulletListIcon = () => (
  <Svg>
    <line x1="9" y1="6" x2="20" y2="6" />
    <line x1="9" y1="12" x2="20" y2="12" />
    <line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
)

const NumberedListIcon = () => (
  <Svg>
    <line x1="10" y1="6" x2="20" y2="6" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="10" y1="18" x2="20" y2="18" />
    <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
    <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
    <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
  </Svg>
)

const AlignLeftIcon = () => (
  <Svg>
    <line x1="17" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </Svg>
)

const AlignCenterIcon = () => (
  <Svg>
    <line x1="18" y1="10" x2="6" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="18" y1="18" x2="6" y2="18" />
  </Svg>
)

const AlignRightIcon = () => (
  <Svg>
    <line x1="21" y1="10" x2="7" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="21" y1="18" x2="7" y2="18" />
  </Svg>
)

const AlignJustifyIcon = () => (
  <Svg>
    <line x1="21" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="21" y1="18" x2="3" y2="18" />
  </Svg>
)

const LinkIcon = () => (
  <Svg>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Svg>
)

const ImageIcon = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </Svg>
)

const TableIcon = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </Svg>
)

const CodeIcon = () => (
  <Svg>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Svg>
)

const MoreIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Svg>
)

const ChevronDownIcon = () => (
  <Svg size={12} strokeWidth={2.5}>
    <polyline points="6 9 12 15 18 9" />
  </Svg>
)

const MinusIcon = () => (
  <Svg size={14} strokeWidth={2.5}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
)

const PlusIcon = () => (
  <Svg size={14} strokeWidth={2.5}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
)

const UploadIcon = () => (
  <Svg size={15}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </Svg>
)

// ---- Small reusable pieces ----

// A toolbar button that never steals the caret from the document
function Btn({ title, active = false, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      className={`toolbar-btn ${active ? 'active' : ''} ${className}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// A dropdown that closes when you click outside of it
function Menu({ renderTrigger, children, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="tb-menu" ref={ref}>
      {renderTrigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`tb-menu-list align-${align}`} onMouseDown={(e) => e.preventDefault()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'HTML', 'CSS', 'JSON', 'SQL', 'Bash']
const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200]

// Every formula the spreadsheet understands: [name, template, short description]
const FORMULA_GROUPS = [
  [
    'Math & statistics',
    [
      ['SUM', '=SUM(A1:A5)', 'Add numbers'],
      ['AVERAGE', '=AVERAGE(A1:A5)', 'Mean of numbers'],
      ['MIN', '=MIN(A1:A5)', 'Smallest number'],
      ['MAX', '=MAX(A1:A5)', 'Largest number'],
      ['COUNT', '=COUNT(A1:A5)', 'Count numbers'],
      ['COUNTA', '=COUNTA(A1:A5)', 'Count non-empty cells'],
      ['PRODUCT', '=PRODUCT(A1:A5)', 'Multiply numbers'],
      ['MEDIAN', '=MEDIAN(A1:A5)', 'Middle value'],
      ['MODE', '=MODE(A1:A5)', 'Most common value'],
      ['STDEV', '=STDEV(A1:A5)', 'Standard deviation'],
      ['VAR', '=VAR(A1:A5)', 'Variance'],
      ['ROUND', '=ROUND(A1,2)', 'Round to digits'],
      ['ROUNDUP', '=ROUNDUP(A1,2)', 'Round up'],
      ['ROUNDDOWN', '=ROUNDDOWN(A1,2)', 'Round down'],
      ['ABS', '=ABS(A1)', 'Absolute value'],
      ['SQRT', '=SQRT(A1)', 'Square root'],
      ['POWER', '=POWER(A1,2)', 'Raise to a power'],
      ['MOD', '=MOD(A1,2)', 'Remainder'],
      ['INT', '=INT(A1)', 'Round down to whole number'],
      ['CEILING', '=CEILING(A1,1)', 'Round up to a multiple'],
      ['FLOOR', '=FLOOR(A1,1)', 'Round down to a multiple'],
      ['PI', '=PI()', 'The number pi'],
    ],
  ],
  [
    'Logical',
    [
      ['IF', '=IF(A1>0,"Yes","No")', 'Choose by a condition'],
      ['AND', '=AND(A1>0,B1>0)', 'All conditions true'],
      ['OR', '=OR(A1>0,B1>0)', 'Any condition true'],
      ['NOT', '=NOT(A1>0)', 'Reverse a condition'],
      ['IFERROR', '=IFERROR(A1/B1,0)', 'Value if there is an error'],
    ],
  ],
  [
    'Conditional',
    [
      ['SUMIF', '=SUMIF(A1:A5,">0",B1:B5)', 'Add if condition matches'],
      ['COUNTIF', '=COUNTIF(A1:A5,">0")', 'Count if condition matches'],
      ['AVERAGEIF', '=AVERAGEIF(A1:A5,">0",B1:B5)', 'Average if condition matches'],
    ],
  ],
  [
    'Text',
    [
      ['CONCAT', '=CONCAT(A1,B1)', 'Join text'],
      ['LEN', '=LEN(A1)', 'Length of text'],
      ['UPPER', '=UPPER(A1)', 'UPPER CASE'],
      ['LOWER', '=LOWER(A1)', 'lower case'],
      ['TRIM', '=TRIM(A1)', 'Remove extra spaces'],
      ['LEFT', '=LEFT(A1,3)', 'First characters'],
      ['RIGHT', '=RIGHT(A1,3)', 'Last characters'],
      ['MID', '=MID(A1,2,3)', 'Middle characters'],
    ],
  ],
  [
    'Lookup',
    [
      ['VLOOKUP', '=VLOOKUP(A1,A1:C5,2,FALSE)', 'Look up down a column'],
      ['HLOOKUP', '=HLOOKUP(A1,A1:E3,2,FALSE)', 'Look up across a row'],
      ['INDEX', '=INDEX(A1:C5,2,2)', 'Cell at row and column'],
      ['MATCH', '=MATCH(A1,A1:A5,0)', 'Position of a value'],
    ],
  ],
  [
    'Date',
    [
      ['TODAY', '=TODAY()', "Today's date"],
      ['NOW', '=NOW()', 'Date and time'],
    ],
  ],
]

// The formula bar: selected cell, a list of formulas, and the formula text box
function FormulaBar({ cell, onApply }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const cellRef = cell ? cell.ref : ''
  const cellContent = cell ? cell.content : ''

  // Show the selected cell's formula / value (unless you are typing in the bar)
  useEffect(() => {
    if (!focused) setDraft(cellContent)
  }, [cellRef, cellContent, focused])

  const apply = () => {
    if (onApply) onApply(draft)
  }

  return (
    <div className="formula-bar">
      <span className="formula-cell-ref" title="Selected cell">
        {cellRef || '—'}
      </span>

      <select
        className="ctx-select formula-select"
        value=""
        aria-label="Choose a formula"
        title="Choose a formula"
        onChange={(e) => {
          const value = e.target.value
          if (!value) return
          setDraft(value)
          if (inputRef.current) inputRef.current.focus()
        }}
      >
        <option value="">Formulas</option>
        {FORMULA_GROUPS.map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map(([name, template, desc]) => (
              <option key={name} value={template}>
                {name} – {desc}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <span className="formula-fx" aria-hidden="true">fx</span>
      <input
        ref={inputRef}
        className="formula-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          } else if (e.key === 'Escape') {
            setDraft(cellContent)
            e.target.blur()
          }
        }}
        placeholder="Select a cell, then type =SUM(A1:A3)"
        spellCheck={false}
        autoComplete="off"
        aria-label="Formula bar"
      />
      <button
        type="button"
        className="ctx-btn primary formula-apply"
        onMouseDown={(e) => e.preventDefault()}
        onClick={apply}
        title="Put this in the selected cell (Enter)"
      >
        Apply
      </button>
    </div>
  )
}

const blockLabelFromBrowser = (value) => {
  const v = String(value || '').toLowerCase().replace(/[<>]/g, '')
  if (v === 'h1') return 'Heading 1'
  if (v === 'h2') return 'Heading 2'
  if (v === 'pre') return 'Code'
  return 'Normal'
}

function Toolbar({
  onFormat,
  onInsertPhoto,
  onInsertCode,
  onCodeLanguage,
  onInsertSheet,
  onSheetAction,
  sheetCell = null,
  onFormulaApply,
  codeLang = 'JavaScript',
  zoom = 100,
  onZoomChange,
}) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const modKey = isMac ? '⌘' : 'Ctrl'

  const [activeTab, setActiveTab] = useState('photo') // 'photo' | 'code' | 'sheet'
  const [blockType, setBlockType] = useState('Normal')
  const [fmt, setFmt] = useState({})

  // Keep B / I / U / S / list buttons and the block dropdown in step with the caret
  useEffect(() => {
    const update = () => {
      const sel = window.getSelection()
      const node = sel && sel.anchorNode
      const host = node && (node.nodeType === 1 ? node : node.parentElement)
      if (!host || !host.closest || !host.closest('.editor-content')) return
      try {
        const next = {
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
          insertUnorderedList: document.queryCommandState('insertUnorderedList'),
          insertOrderedList: document.queryCommandState('insertOrderedList'),
        }
        setFmt((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        setBlockType(blockLabelFromBrowser(document.queryCommandValue('formatBlock')))
      } catch {
        // some browsers throw for commands they do not know - ignore
      }
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const blockTypes = [
    { label: 'Normal', arg: 'P' },
    { label: 'Heading 1', arg: 'H1' },
    { label: 'Heading 2', arg: 'H2' },
  ]

  const handleZoomIn = () => onZoomChange && onZoomChange(Math.min(zoom + 10, 200))
  const handleZoomOut = () => onZoomChange && onZoomChange(Math.max(zoom - 10, 50))

  const insertPlainTable = () => {
    const cell = '<td>&nbsp;</td>'
    const html = `<table class="doc-table"><tr>${cell}${cell}${cell}</tr><tr>${cell}${cell}${cell}</tr></table><p><br></p>`
    onFormat('insertHTML', html)
  }

  return (
    <div className="toolbar-wrapper">
      {/* ===== Row 1: mode tabs + contextual tools + zoom ===== */}
      <div className="toolbar-tabs-row">
        <div className="toolbar-tabs">
          <button
            type="button"
            className={`toolbar-tab ${activeTab === 'photo' ? 'active' : ''}`}
            onClick={() => setActiveTab('photo')}
          >
            <ImageIcon />
            <span>Photograph</span>
          </button>
          <button
            type="button"
            className={`toolbar-tab ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            <CodeIcon />
            <span>Code</span>
          </button>
          <button
            type="button"
            className={`toolbar-tab ${activeTab === 'sheet' ? 'active' : ''}`}
            onClick={() => setActiveTab('sheet')}
          >
            <TableIcon />
            <span>Spreadsheet</span>
          </button>
        </div>

        {/* Tools that belong to the selected tab */}
        <div className="toolbar-context">
          {activeTab === 'photo' && (
            <>
              <button type="button" className="ctx-btn primary" onMouseDown={(e) => e.preventDefault()} onClick={onInsertPhoto}>
                <UploadIcon />
                <span>Upload photo</span>
              </button>
              <span className="ctx-hint">Pictures are shrunk automatically</span>
            </>
          )}

          {activeTab === 'code' && (
            <>
              <select
                className="ctx-select"
                value={codeLang}
                onChange={(e) => onCodeLanguage && onCodeLanguage(e.target.value)}
                aria-label="Code language"
                title="Code language"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button type="button" className="ctx-btn primary" onMouseDown={(e) => e.preventDefault()} onClick={onInsertCode}>
                <CodeIcon />
                <span>Insert code block</span>
              </button>
              <span className="ctx-hint">Click a block's language badge to copy it</span>
            </>
          )}

          {activeTab === 'sheet' && (
            <>
              <button type="button" className="ctx-btn primary" onMouseDown={(e) => e.preventDefault()} onClick={onInsertSheet}>
                <TableIcon />
                <span>Insert spreadsheet</span>
              </button>
              <FormulaBar cell={sheetCell} onApply={onFormulaApply} />
              <button type="button" className="ctx-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onSheetAction && onSheetAction('addRow')}>
                <PlusIcon />
                <span>Row</span>
              </button>
              <button type="button" className="ctx-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onSheetAction && onSheetAction('addCol')}>
                <PlusIcon />
                <span>Column</span>
              </button>
              <span className="ctx-hint">Formulas: =SUM(A1:A3)</span>
            </>
          )}
        </div>

        <div className="toolbar-zoom">
          <button type="button" className="toolbar-zoom-btn" onClick={handleZoomOut} title="Zoom out">
            <MinusIcon />
          </button>
          <Menu
            align="center"
            renderTrigger={({ toggle }) => (
              <button type="button" className="toolbar-zoom-value" onClick={toggle} title="Choose zoom level">
                <span>{zoom}%</span>
                <ChevronDownIcon />
              </button>
            )}
          >
            {(close) =>
              ZOOM_LEVELS.map((z) => (
                <button
                  type="button"
                  key={z}
                  className={`tb-menu-item ${z === zoom ? 'active' : ''}`}
                  onClick={() => {
                    onZoomChange && onZoomChange(z)
                    close()
                  }}
                >
                  {z}%
                </button>
              ))
            }
          </Menu>
          <button type="button" className="toolbar-zoom-btn" onClick={handleZoomIn} title="Zoom in">
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* ===== Row 2: formatting toolbar ===== */}
      <div className="toolbar">
        {/* Block type */}
        <Menu
          renderTrigger={({ toggle }) => (
            <button
              type="button"
              className="toolbar-block-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggle}
              title="Block type"
            >
              <span>{blockType}</span>
              <ChevronDownIcon />
            </button>
          )}
        >
          {(close) =>
            blockTypes.map((bt) => (
              <button
                type="button"
                key={bt.label}
                className={`tb-menu-item ${bt.label === blockType ? 'active' : ''}`}
                onClick={() => {
                  setBlockType(bt.label)
                  onFormat('formatBlock', bt.arg)
                  close()
                }}
              >
                {bt.label}
              </button>
            ))
          }
        </Menu>

        <div className="toolbar-divider" />

        {/* Text formatting */}
        <div className="toolbar-group">
          <Btn title={`Bold (${modKey}+B)`} active={fmt.bold} onClick={() => onFormat('bold')}><b>B</b></Btn>
          <Btn title={`Italic (${modKey}+I)`} active={fmt.italic} onClick={() => onFormat('italic')}><i>I</i></Btn>
          <Btn title={`Underline (${modKey}+U)`} active={fmt.underline} onClick={() => onFormat('underline')}><u>U</u></Btn>
          <Btn title="Strikethrough" active={fmt.strikeThrough} onClick={() => onFormat('strikeThrough')}><s>S</s></Btn>
        </div>

        <div className="toolbar-divider" />

        {/* Alignment */}
        <div className="toolbar-group">
          <Btn title="Align Left" onClick={() => onFormat('justifyLeft')}><AlignLeftIcon /></Btn>
          <Btn title="Align Center" onClick={() => onFormat('justifyCenter')}><AlignCenterIcon /></Btn>
          <Btn title="Align Right" onClick={() => onFormat('justifyRight')}><AlignRightIcon /></Btn>
          <Btn title="Justify" onClick={() => onFormat('justifyFull')}><AlignJustifyIcon /></Btn>
        </div>

        <div className="toolbar-divider" />

        {/* Lists (button + dropdown arrow) */}
        <div className="toolbar-group">
          <Btn
            title={`Bullet List (${modKey}+Shift+8)`}
            active={fmt.insertUnorderedList}
            onClick={() => onFormat('insertUnorderedList')}
          >
            <BulletListIcon />
          </Btn>
          <Menu
            renderTrigger={({ toggle }) => (
              <button
                type="button"
                className="toolbar-btn toolbar-btn-small"
                title="More list types"
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggle}
              >
                <ChevronDownIcon />
              </button>
            )}
          >
            {(close) => (
              <>
                <button type="button" className="tb-menu-item" onClick={() => { onFormat('insertUnorderedList'); close() }}>
                  <BulletListIcon /> <span>Bullet list</span>
                </button>
                <button type="button" className="tb-menu-item" onClick={() => { onFormat('insertOrderedList'); close() }}>
                  <NumberedListIcon /> <span>Numbered list</span>
                </button>
              </>
            )}
          </Menu>
        </div>

        <div className="toolbar-divider" />

        {/* Insert */}
        <div className="toolbar-group">
          <Btn
            title="Insert Link"
            onClick={() => {
              const url = prompt('Enter URL:')
              if (url) onFormat('createLink', url)
            }}
          >
            <LinkIcon />
          </Btn>
          <Btn
            title="Insert Image from URL"
            onClick={() => {
              const url = prompt('Enter image URL:')
              if (url) onFormat('insertImage', url)
            }}
          >
            <ImageIcon />
          </Btn>
          <Btn title="Insert Table" onClick={insertPlainTable}><TableIcon /></Btn>
          <Btn title="Insert Code Block" onClick={onInsertCode}><CodeIcon /></Btn>
        </div>

        <div className="toolbar-divider" />

        {/* More */}
        <Menu
          align="right"
          renderTrigger={({ toggle }) => (
            <button
              type="button"
              className="toolbar-btn"
              title="More options"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggle}
            >
              <MoreIcon />
            </button>
          )}
        >
          {(close) => (
            <>
              <button type="button" className="tb-menu-item" onClick={() => { onFormat('undo'); close() }}>
                Undo <span className="tb-menu-key">{modKey}+Z</span>
              </button>
              <button type="button" className="tb-menu-item" onClick={() => { onFormat('redo'); close() }}>
                Redo <span className="tb-menu-key">{modKey}+Y</span>
              </button>
              <button type="button" className="tb-menu-item" onClick={() => { onFormat('insertOrderedList'); close() }}>
                Numbered list <span className="tb-menu-key">{modKey}+Shift+7</span>
              </button>
              <button type="button" className="tb-menu-item" onClick={() => { onFormat('insertHorizontalRule'); close() }}>
                Horizontal line
              </button>
              <button type="button" className="tb-menu-item" onClick={() => { onFormat('removeFormat'); close() }}>
                Clear formatting
              </button>
            </>
          )}
        </Menu>
      </div>
    </div>
  )
}

export default Toolbar