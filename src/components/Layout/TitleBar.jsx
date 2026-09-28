import { useState } from 'react'
import './TitleBar.css'

const SidebarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
)

function TitleBar({ title, onTitleChange, user, onLogout, sidebarOpen, onToggleSidebar }) {
  const [editing, setEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)

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
        {onToggleSidebar && (
          <button
            type="button"
            className={`title-bar-sidebar-btn ${sidebarOpen ? 'on' : ''}`}
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide files panel' : 'Show files panel'}
            aria-pressed={!!sidebarOpen}
            title={sidebarOpen ? 'Hide files panel' : 'Show files panel'}
          >
            <SidebarIcon />
          </button>
        )}
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

      {onLogout && (
        <div className="title-bar-right">
          {user?.name && <span className="title-bar-user">{user.name}</span>}
          <button type="button" className="title-bar-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </header>
  )
}

export default TitleBar