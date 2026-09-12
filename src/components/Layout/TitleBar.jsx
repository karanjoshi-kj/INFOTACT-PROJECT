import { useState } from 'react'
import './TitleBar.css'

function TitleBar({ title, onTitleChange }) {
  const [editing, setEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)

  const handleBlur = () => {
    setEditing(false)
    onTitleChange(localTitle.trim() || 'Untitled Document')
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
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          />
        ) : (
          <h1 className="title-bar-doc-title" onClick={() => setEditing(true)}>
            {title}
          </h1>
        )}
      </div>
      <div className="title-bar-right">
        {/* Placeholder — active-user avatars get added in Week 2 sync work */}
        <span className="title-bar-status">● Local draft</span>
      </div>
    </header>
  )
}

export default TitleBar