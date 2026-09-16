import { useState, useEffect } from 'react'
import './TitleBar.css'

function TitleBar({ title, onTitleChange }) {
  const [editing, setEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)

  // Keep the local input in sync if the title changes from outside while not editing
  useEffect(() => {
    if (!editing) {
      setLocalTitle(title)
    }
  }, [title, editing])

  const startEditing = () => {
    setLocalTitle(title)
    setEditing(true)
  }

  const handleBlur = () => {
    setEditing(false)
    onTitleChange(localTitle.trim() || 'Untitled Document')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setLocalTitle(title)
      setEditing(false)
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      startEditing()
    }
  }

  return (
    <header className="title-bar">
      <div className="title-bar-left">
        <span className="title-bar-logo">SyncDoc</span>
        {editing ? (
          <input
            className="title-bar-input"
            autoFocus
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            aria-label="Document title"
          />
        ) : (
          <h1
            className="title-bar-doc-title"
            onClick={startEditing}
            onKeyDown={handleTitleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Document title: ${title}. Click to rename.`}
          >
            {title}
          </h1>
        )}
      </div>
    </header>
  )
}

export default TitleBar