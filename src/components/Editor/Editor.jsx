import { useRef } from 'react'
import Toolbar from './Toolbar.jsx'
import './Editor.css'

function Editor() {
  const editorRef = useRef(null)

  // NOTE: document.execCommand is a quick Week-1 stand-in.
  // It'll be replaced once the AST-based block editor architecture
  // (per the CRDT/Yjs sync plan) is wired up in later weeks.
  const handleFormat = (command) => {
    document.execCommand(command, false, null)
    editorRef.current.focus()
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
      />
    </div>
  )
}

export default Editor