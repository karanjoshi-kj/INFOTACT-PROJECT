import { useRef, useEffect } from 'react'
import Toolbar from './Toolbar.jsx'
import './Editor.css'

// NOTE: document.execCommand is a quick Week-1 stand-in.
// It'll be replaced once the AST-based block editor architecture
// (per the CRDT/Yjs sync plan) is wired up in later weeks.
function Editor({ value, onChange }) {
  const editorRef = useRef(null)

  // Set initial content once on mount only — we deliberately don't
  // re-sync on every `value` change, since overwriting innerText on
  // every keystroke would reset the cursor position mid-typing.
  useEffect(() => {
    if (editorRef.current && value && editorRef.current.innerText === '') {
      editorRef.current.innerText = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFormat = (command, arg = null) => {
    document.execCommand(command, false, arg)
    editorRef.current.focus()
  }

  const handleInput = (e) => {
    onChange(e.currentTarget.innerText)
  }

  const handleKeyDown = (e) => {
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
      <Toolbar onFormat={handleFormat} />
      <div
        ref={editorRef}
        className="editor-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Start typing your document..."
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

export default Editor