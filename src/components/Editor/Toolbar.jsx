import './Toolbar.css'

const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
  </svg>
)

const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
  </svg>
)

const BulletListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="20" y2="6" />
    <line x1="9" y1="12" x2="20" y2="12" />
    <line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const NumberedListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="10" y1="6" x2="20" y2="6" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="10" y1="18" x2="20" y2="18" />
    <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
    <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
    <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
  </svg>
)

function Toolbar({ onFormat }) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const modKey = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title={`Undo (${modKey}+Z)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('undo')}
        >
          <UndoIcon />
        </button>
        <button
          className="toolbar-btn"
          title={`Redo (${modKey}+Y)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('redo')}
        >
          <RedoIcon />
        </button>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn toolbar-btn-text"
          title={`Heading 1 (${modKey}+Alt+1)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('formatBlock', 'H1')}
        >
          H1
        </button>
        <button
          className="toolbar-btn toolbar-btn-text"
          title={`Heading 2 (${modKey}+Alt+2)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('formatBlock', 'H2')}
        >
          H2
        </button>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title={`Bold (${modKey}+B)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('bold')}
        >
          <b>B</b>
        </button>
        <button
          className="toolbar-btn"
          title={`Italic (${modKey}+I)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('italic')}
        >
          <i>I</i>
        </button>
        <button
          className="toolbar-btn"
          title={`Underline (${modKey}+U)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('underline')}
        >
          <u>U</u>
        </button>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title={`Bullet List (${modKey}+Shift+8)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('insertUnorderedList')}
        >
          <BulletListIcon />
        </button>
        <button
          className="toolbar-btn"
          title={`Numbered List (${modKey}+Shift+7)`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat('insertOrderedList')}
        >
          <NumberedListIcon />
        </button>
      </div>
    </div>
  )
}

export default Toolbar