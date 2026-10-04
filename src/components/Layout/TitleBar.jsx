import { useState, useRef, useEffect } from 'react'
import './TitleBar.css'

const SidebarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
)

const StarIcon = ({ filled }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? '#facc15' : 'none'} stroke={filled ? '#facc15' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const DocIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </svg>
)

const getInitials = (name) => {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

const USER_COLOR = '#4f6ef7'

function TitleBar({
  title,
  onTitleChange,
  user,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
  peers = [],
  roomCode = '',
  onJoinRoom,
}) {
  const [editing, setEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)
  const [starred, setStarred] = useState(false)
  const [joinValue, setJoinValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close the user menu when you click anywhere else
  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

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

  // Join a room from the box: accepts a code (AB12CD) or a full link
  const handleJoinSubmit = (e) => {
    e.preventDefault()
    if (!joinValue.trim() || !onJoinRoom) return
    const joined = onJoinRoom(joinValue)
    if (joined) setJoinValue('')
  }

  // Real people in the room (falls back to just you)
  const people = peers.length > 0 ? peers : [{ id: 'me', name: user?.name || 'You', color: USER_COLOR }]
  const shown = people.slice(0, 3)
  const extra = people.length - shown.length

  return (
    <header className="title-bar">
      {/* ---------- left: document ---------- */}
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

        <div className="title-bar-doc-icon">
          <DocIcon />
        </div>

        <div className="title-bar-doc-info">
          <div className="title-bar-doc-header">
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
            <button
              type="button"
              className={`title-bar-star-btn ${starred ? 'starred' : ''}`}
              onClick={() => setStarred(!starred)}
              title={starred ? 'Remove from favorites' : 'Add to favorites'}
            >
              <StarIcon filled={starred} />
            </button>
          </div>
          <div className="title-bar-breadcrumb">/ My Documents</div>
        </div>
      </div>

      {/* ---------- middle: who is online ---------- */}
      <div className="title-bar-center">
        <div className="collaborator-avatars">
          {shown.map((p, i) => (
            <div
              key={p.id}
              className="collaborator-avatar"
              style={{ backgroundColor: p.color, zIndex: 10 - i }}
              title={p.name}
            >
              <span>{getInitials(p.name)}</span>
            </div>
          ))}
          {extra > 0 && (
            <div className="collaborator-avatar collaborator-more" style={{ zIndex: 0 }}>
              <span>+{extra}</span>
            </div>
          )}
        </div>
        <div className="collaborator-status">
          <span className="collaborator-dot" />
          <span>
            {people.length} collaborator{people.length === 1 ? '' : 's'} online
          </span>
        </div>
      </div>

      {/* ---------- right: join a room + user ---------- */}
      <div className="title-bar-right">
        <form className="join-room" onSubmit={handleJoinSubmit} title={roomCode ? `You are in room ${roomCode}` : 'Join a room'}>
          <LinkIcon />
          <input
            className="join-room-input"
            type="text"
            value={joinValue}
            onChange={(e) => setJoinValue(e.target.value)}
            placeholder="Room code or link"
            aria-label="Enter a room code or room link to join"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="join-room-btn" disabled={!joinValue.trim()}>
            Join
          </button>
        </form>

        {user && (
          <div className="title-bar-user-wrap" ref={menuRef}>
            <button
              type="button"
              className="title-bar-user-section"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div className="title-bar-user-avatar" style={{ backgroundColor: USER_COLOR }}>
                {getInitials(user.name)}
              </div>
              <div className="title-bar-user-info">
                <span className="title-bar-user-name">{user.name}</span>
                <span className="title-bar-user-role">Editor</span>
              </div>
              <span className={`title-bar-chevron ${menuOpen ? 'open' : ''}`}>
                <ChevronDown />
              </span>
            </button>

            {menuOpen && (
              <div className="user-menu" role="menu">
                {user.email && <div className="user-menu-email">{user.email}</div>}
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                >
                  <LogoutIcon />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default TitleBar