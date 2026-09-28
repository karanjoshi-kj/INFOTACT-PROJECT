import { useRef, useEffect } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import Toolbar from './Toolbar.jsx'
import './Editor.css'

// documentId decides which "room" this editor syncs to - all users editing
// the same document must use the same documentId.
function Editor({ initialHtml = '', onChange, documentId = 'shared-doc' }) {
  const editorRef = useRef(null)
  const ydocRef = useRef(null)
  const ytextRef = useRef(null)
  const providerRef = useRef(null)
  const isLocalUpdate = useRef(false) // guards against feedback loops

  // Set up the shared Yjs document + WebSocket connection once on mount
  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider('ws://localhost:1234', documentId, ydoc)
    const ytext = ydoc.getText('content')

    ydocRef.current = ydoc
    ytextRef.current = ytext
    providerRef.current = provider

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
          if (el) el.innerHTML = ytext.toString()
        } else if (initialHtml) {
          ydoc.transact(() => {
            ytext.insert(0, initialHtml)
          })
        }
      }
    })

    return () => {
      ytext.unobserve(updateDOM)
      provider.destroy()
      ydoc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

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