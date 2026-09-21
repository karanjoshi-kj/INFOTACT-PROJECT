import { useRef, useEffect } from 'react'
import Toolbar from './Toolbar.jsx'
import './Editor.css'

// NOTE: document.execCommand is deprecated but still works in all browsers.
// It is a Week-1 stand-in and will be replaced when the AST-based block
// editor (Yjs / CRDT sync plan) is wired up in later weeks.
//
// Props:
//   initialHtml - optional HTML to load once when the editor first appears
//   onChange    - called on every edit with { html, text }
//                 html -> keeps formatting, this is what the backend
//                         text-to-tree function will receive
//                 text -> plain text, used for word/character counts
function Editor({ initialHtml = '', onChange }) {
  const editorRef = useRef(null)

  // Load the initial content ONCE on mount. We never re-sync afterwards,
  // because overwriting the content on every keystroke would reset the cursor.
  useEffect(() => {
    if (editorRef.current && initialHtml && editorRef.current.innerHTML === '') {
      editorRef.current.innerHTML = initialHtml
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFormat = (command, arg = null) => {
    document.execCommand(command, false, arg)
    editorRef.current.focus()
    // execCommand fires an "input" event by itself, so handleInput runs next.
  }

  const handleInput = () => {
    const el = editorRef.current
    if (!el) return

    // After deleting everything, browsers leave a stray <br>, which hides
    // the placeholder. Clearing it brings the placeholder back.
    if (el.innerHTML === '<br>') {
      el.innerHTML = ''
    }

    if (onChange) {
      onChange({ html: el.innerHTML, text: el.innerText })
    }
  }

  // Always paste as plain text so text copied from websites/Word
  // doesn't bring in messy styles and break the document structure.
  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
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
        onPaste={handlePaste}
      />
    </div>
  )
}

export default Editor