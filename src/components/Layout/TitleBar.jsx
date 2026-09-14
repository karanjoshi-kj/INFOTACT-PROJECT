import { useState } from 'react'
import './TitleBar.css'

function TitleBar({ title, onTitleChange, saveStatus }) {
  const [editing, setEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)

  const handleBlur = () => {
    setEditing(false)
    onTitleChange(localTitle.trim() || 'Untitled Document')
  }

  const isSaved = saveStatus === 'All changes saved'
  const isSaving = saveStatus === 'Saving...'
  const statusClass = isSaved ? 'is-saved' : isSaving ? 'is-saving' : 'is-unsaved'

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
        <span className={`title-bar-status ${statusClass}`}>
          <span className="title-bar-status-dot"></span>
          {saveStatus}
        </span>
      </div>
    </header>
  )
}

export default TitleBar