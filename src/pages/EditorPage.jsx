import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TitleBar from '../components/Layout/TitleBar.jsx'
import Editor from '../components/Editor/Editor.jsx'
import FileExplorer from '../components/Sidebar/FileExplorer.jsx'
import { getUser, clearSession } from "../utils/auth.js";
import {
  createDocument,
  getDocument,
  saveDocument,
  listDocuments,
  listOfflineChanges,
  ackDocumentSynced,
  listCollabDocuments,
  listRoomJoinRequests,
  createRoom,
  markDocumentCollab,
  requestRoomMembership,
  unmarkDocumentCollab,
} from '../services/api.js'
import useSharedTitle from '../hooks/useSharedTitle.js'
import './EditorPage.css'

const SAVE_DELAY = 1000 // ms of no typing before we save (the "debounce")
const RETRY_DELAY = 4000 // ms before retrying a failed save
const RECENT_ROOMS_KEY = 'syncdoc-recent-rooms'
const NO_PEERS = [] // stable empty list (a solo document has no collaborators)
const HOST_COLOR = '#f59e0b' // same host colour as the editor and title bar
const OFFLINE_POLL_MS = 8000 // how often the "changed while you were offline" marks are refreshed

// The small "!" shown beside a document that was changed while you were offline
const OFFLINE_FLAG_STYLE = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  marginLeft: 4,
  borderRadius: '50%',
  background: '#ef4444',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
}

// ---------------------------------------------------------------
// ICONS
// ---------------------------------------------------------------
const Svg = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const SunIcon = () => (
  <Svg size={18}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </Svg>
)

const MoonIcon = () => (
  <Svg size={18}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Svg>
)

const CloudIcon = () => (
  <Svg size={22}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </Svg>
)

const FolderIcon = () => (
  <Svg>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Svg>
)

const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
)

const UsersIcon = () => (
  <Svg>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
)

const LinkIcon = () => (
  <Svg>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Svg>
)

const CopyIcon = () => (
  <Svg size={15}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
)

const CheckIcon = () => (
  <Svg size={15}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
)

const FileSmallIcon = () => (
  <Svg size={15}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </Svg>
)

const CrownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </svg>
)

// SyncDoc cloud logo (two overlapping clouds, blue + purple)
const LogoIcon = () => (
  <svg width="44" height="36" viewBox="0 0 44 36" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="sdLogoA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#60a5fa" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
      <linearGradient id="sdLogoB" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a78bfa" />
        <stop offset="1" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    <path d="M33 30H12a8 8 0 0 1-1.4-15.88A10 10 0 0 1 30 12.5 8.5 8.5 0 0 1 33 30z" fill="url(#sdLogoB)" opacity="0.85" transform="translate(5 -2)" />
    <path d="M30 31H11a8.5 8.5 0 0 1-1.5-16.87A11 11 0 0 1 30.5 12 9.5 9.5 0 0 1 30 31z" fill="url(#sdLogoA)" />
    <path d="M17 21h10M22 16v10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------
const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem('syncdoc-theme')
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const getInitialSidebarOpen = () => {
  try {
    return localStorage.getItem('syncdoc-sidebar-open') !== 'false'
  } catch {
    return true
  }
}

// html -> plain text, only used to show word/character counts for a freshly loaded document
const htmlToPlainText = (html) => {
  const box = document.createElement('div')
  box.innerHTML = html
  box.querySelectorAll('div, p, h1, h2, li').forEach((node) => node.append(' '))
  return box.textContent || ''
}

const lastDocKey = (user) => `syncdoc-last-doc-${user?.id || 'anon'}`

// Each document remembers its own room code
const roomKey = (docId) => `syncdoc-room-${docId}`

// Your role in a room: 'host' (you created it) or 'collab' (you joined it)
const roleKey = (user, code) => `syncdoc-role-${user?.id || 'anon'}-${code}`

const readRole = (user, code) => {
  try {
    const role = localStorage.getItem(roleKey(user, code))
    return role === 'host' || role === 'collab' ? role : null
  } catch {
    return null
  }
}

const writeRole = (user, code, role) => {
  try {
    localStorage.setItem(roleKey(user, code), role)
  } catch {
    // ignore storage errors
  }
}

// Generate a random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// Keep only letters and digits, upper-case, max 12 characters
const cleanRoom = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)

// Accepts "AB12CD", "ab12cd", or a link like http://site/editor?room=AB12CD
function parseRoomInput(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    const fromParam = url.searchParams.get('room')
    if (fromParam) return cleanRoom(fromParam)
  } catch {
    // not a full URL - try the other shapes below
  }
  const match = value.match(/[?&]room=([^&#\s]+)/i)
  if (match) return cleanRoom(decodeURIComponent(match[1]))
  return cleanRoom(value)
}

const readRecentRooms = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard API may be blocked - fall back to the old way
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const docId = searchParams.get('doc') // /editor?doc=ID
  const pendingRoomRef = useRef(searchParams.get('room')) // /editor?room=CODE (a shared link)

  const [title, setTitle] = useState('Untitled Document')
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('')
  const [initialHtml, setInitialHtml] = useState('')
  const [initialToolState, setInitialToolState] = useState(null) // persisted tool state from backend
  const [saveStatus, setSaveStatus] = useState('Loading...')
  const [saveProgress, setSaveProgress] = useState(0) // 0-100 for the progress bar
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [theme, setTheme] = useState(getInitialTheme)
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [loadedDocId, setLoadedDocId] = useState(null) // the document whose title is in `title`
  // People in the room, tagged with the document + room they belong to (see `scope` below)
  const [presence, setPresence] = useState({ scope: '', list: [] })
  // A room code only belongs to the document whose room was confirmed by REST.
  // Route changes must not briefly pass the previous document's code to Editor.
  const [roomBinding, setRoomBinding] = useState({ documentId: null, code: '' })
  const roomCode = roomBinding.documentId === docId ? roomBinding.code : ''
  const [roomCodeCopied, setRoomCodeCopied] = useState(false)
  const [roomLinkCopied, setRoomLinkCopied] = useState(false)
  const [recentRooms, setRecentRooms] = useState(readRecentRooms)
  const [panel, setPanel] = useState(null) // null (explorer) | 'search' | 'collab' | 'room'
  const [searchText, setSearchText] = useState('')
  const [allDocs, setAllDocs] = useState([])
  const [toast, setToast] = useState(null) // { message, type }
  const [yjsConnection, setYjsConnection] = useState(null)
  const navigate = useNavigate()
  const user = getUser()

  const docIdRef = useRef(null) // the document that is currently loaded
  const currentDocumentReady =
    loadState === 'ready' &&
    !!docId &&
    loadedDocId === docId &&
    docIdRef.current === docId
  const editorRoomCode = currentDocumentReady ? roomCode : ''
  const [roomRole, setRoomRole] = useState('host') // 'host' | 'collab' - your role in the current room
  const [accessState, setAccessState] = useState({ scope: '', value: 'granted' }) // access, tagged with its document + room
  const [collabDocs, setCollabDocs] = useState([]) // shown in "Collab Files" (loaded from the server)
  const [offlineDocIds, setOfflineDocIds] = useState([]) // documents changed while you were offline (from the server)
  const [roomJoinRequests, setRoomJoinRequests] = useState([])

  // Collaboration state belongs to ONE document + ONE room. Anything reported by an editor
  // (people online, access) is stored with that scope, and is only used while the open
  // document and room still match it. A late report from a previous document is ignored.
  const scope = `${docId || ''}|${roomCode}`
  const peers = presence.scope === scope ? presence.list : NO_PEERS
  const roomAccess = accessState.scope === scope ? accessState.value : roomRole === 'host' ? 'granted' : 'pending'
  const handlePresenceChange = (list) => setPresence({ scope, list })
  const handleAccessChange = (value) => {
    setAccessState({ scope, value })
    if (value !== 'closed' || !docId) return

    // The backend closed this connection because the real Room was deleted.
    // Unbind it so no further room-specific requests can be made.
    setRoomBinding((current) => current.documentId === docId ? { documentId: docId, code: '' } : current)
    setRoomRole('host')
    try {
      localStorage.removeItem(roomKey(docId))
    } catch {
      // ignore storage errors
    }
    removeCollab(docId)
    saveDocument(docId, { roomCode: null }).catch(() => {})
  }

  const collaboratorCount = Math.max(1, peers.length)

  // The colour indicator and the "N collaborators online" status belong to ONE thing only:
  // the document that is open right now, while it has an active room (hosted, joined, or shared).
  // It is worked out from this document's own state, never from rooms used on other documents.
  const collabActive =
    currentDocumentReady &&
    docId !== 'new' &&
    !!roomCode &&
    roomAccess !== 'denied' &&
    roomAccess !== 'closed' &&
    (roomRole === 'collab' ||
      peers.length > 1 ||
      collabDocs.some((e) => e.id === docId && e.room === roomCode))

  // Always holds the newest { html, text } from the editor.
  const latestContentRef = useRef({ html: '', text: '' })
  const titleRef = useRef('Untitled Document')
  const dirtyRef = useRef({ html: false, title: false, toolState: false }) // what still needs saving
  const toolStateRef = useRef(null) // latest tool state from the editor
  const debounceTimerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const toastTimerRef = useRef(null)
  const isSavingRef = useRef(false)
  const creatingRef = useRef(false) // stops React StrictMode from creating 2 documents
  const refreshFlagsRef = useRef(null) // always the newest "refresh the ! marks" function
  const collabSavedRef = useRef({}) // docId -> "role:room" that the server already knows as collaborative

  // Apply theme to the whole document and remember the choice
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('syncdoc-theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  // Small message that pops up bottom-centre
  const showToast = useCallback((message, type = 'info') => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('syncdoc-sidebar-open', String(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const updateCounts = (text) => {
    const trimmed = text.trim()
    setWordCount(trimmed ? trimmed.split(/\s+/).length : 0)
    setCharCount(text.length)
  }

  const goToLogin = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  // Rejected WebSocket clients cannot publish awareness, so read pending requests from MongoDB.
  useEffect(() => {
    if (!currentDocumentReady || roomRole !== 'host' || !roomCode) {
      setRoomJoinRequests([])
      return undefined
    }

    let cancelled = false
    const refreshRoomRequests = async () => {
      try {
        const data = await listRoomJoinRequests(roomCode)
        if (!cancelled) setRoomJoinRequests(data.requests || [])
      } catch (error) {
        if (!cancelled && error.status === 401) goToLogin()
      }
    }

    refreshRoomRequests()
    const timer = setInterval(refreshRoomRequests, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [currentDocumentReady, loadedDocId, docId, roomRole, roomCode, goToLogin])

  // ---------------------------------------------------------------
  // OFFLINE CHANGE MARKS ("!" beside a document changed while you were offline)
  // The server decides which documents get a mark; this only asks for the list.
  // ---------------------------------------------------------------
  const refreshOfflineFlags = async () => {
    try {
      const data = await listOfflineChanges()
      const ids = (data.documents || []).map((d) => d.id).sort()
      setOfflineDocIds((prev) => (prev.length === ids.length && prev.every((x, k) => x === ids[k]) ? prev : ids))
    } catch (err) {
      if (err.status === 401) goToLogin()
    }
  }
  refreshFlagsRef.current = refreshOfflineFlags

  useEffect(() => {
    refreshFlagsRef.current()
    const timer = setInterval(() => refreshFlagsRef.current(), OFFLINE_POLL_MS)
    const onFocus = () => refreshFlagsRef.current()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // The room's latest content has reached this document: tell the server so the "!" goes away
  const handleRoomSynced = () => {
    const id = docIdRef.current
    if (!id) return
    ackDocumentSynced(id)
      .then(() => refreshFlagsRef.current())
      .catch((err) => {
        if (err.status === 401) goToLogin()
      })
  }

  // ---------------------------------------------------------------
  // COLLAB FILES (documents you share or joined)
  // ---------------------------------------------------------------
  // The server remembers (in MongoDB) which documents have a room that was created or joined.
  const markCollab = useCallback((role, code) => {
    const id = docIdRef.current
    if (!id || !code) return
    setCollabDocs((prev) => {
      const entry = { id, title: titleRef.current, room: code, role }
      const existing = prev.find((e) => e.id === id)
      if (existing && existing.room === code && existing.role === role && existing.title === entry.title) return prev
      return existing ? prev.map((e) => (e.id === id ? entry : e)) : [entry, ...prev]
    })
    const key = `${role}:${code}`
    if (collabSavedRef.current[id] === key) return // the server already knows this
    collabSavedRef.current[id] = key
    markDocumentCollab(id, { roomCode: code, role }).catch((err) => {
      if (collabSavedRef.current[id] === key) delete collabSavedRef.current[id] // try again next time
      if (err.status === 401) goToLogin()
    })
  }, [])

  // persist = false when the document itself no longer exists (nothing to update on the server)
  const removeCollab = useCallback((id, persist = true) => {
    if (!id) return
    setCollabDocs((prev) => (prev.some((e) => e.id === id) ? prev.filter((e) => e.id !== id) : prev))
    delete collabSavedRef.current[id]
    if (persist) {
      unmarkDocumentCollab(id).catch((err) => {
        if (err.status === 401) goToLogin()
      })
    }
  }, [])

  // A document becomes a collab file when you join a room, or when someone joins yours
  useEffect(() => {
    if (!currentDocumentReady || !roomCode) return
    if (roomRole === 'collab' && roomAccess === 'denied') {
      removeCollab(docIdRef.current) // the host refused you: this is not a collaboration
      return
    }
    if (roomRole === 'collab' || peers.length > 1) markCollab(roomRole, roomCode)
  }, [currentDocumentReady, loadedDocId, docId, roomCode, roomRole, roomAccess, peers.length, markCollab, removeCollab])

  // Keep the title in the Collab Files list current
  useEffect(() => {
    if (!loadedDocId) return
    setCollabDocs((prev) =>
      prev.some((e) => e.id === loadedDocId && e.title !== title)
        ? prev.map((e) => (e.id === loadedDocId ? { ...e, title } : e))
        : prev
    )
  }, [loadedDocId, title])

  // Load the collaborative documents from the server (only documents that have a created / joined room)
  useEffect(() => {
    let cancelled = false
    listCollabDocuments()
      .then((data) => {
        if (cancelled) return
        const fromServer = data.collabDocuments || []
        fromServer.forEach((e) => {
          collabSavedRef.current[e.id] = `${e.role}:${e.room}`
        })
        setCollabDocs((prev) => {
          const open = docIdRef.current
          const next = fromServer.map((e) => {
            const old = prev.find((p) => p.id === e.id)
            return e.id === open && old ? { ...e, title: old.title } : e // the open document keeps its newest title
          })
          // the open document was just marked and the server list was read a moment too early
          const justMarked = prev.find((p) => p.id === open && !next.some((n) => n.id === open))
          if (justMarked) next.unshift(justMarked)
          const same =
            next.length === prev.length &&
            next.every(
              (e, k) => e.id === prev[k].id && e.title === prev[k].title && e.room === prev[k].room && e.role === prev[k].role
            )
          return same ? prev : next
        })
      })
      .catch((err) => {
        if (err.status === 401) goToLogin()
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // ---------------------------------------------------------------
  // ROOMS (generate / copy / join / leave)
  // ---------------------------------------------------------------
  const addRecentRoom = useCallback((code) => {
    const entry = { code, title: titleRef.current, ts: Date.now() }
    const next = [entry, ...readRecentRooms().filter((r) => r.code !== code)].slice(0, 8)
    try {
      localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
    setRecentRooms(next)
  }, [])

  // Switch the open document to a (new or joined) room
  const applyRoom = (code, role = 'host', collab = false) => {
    // The editor restarts for the new room, so hand it the newest text (not the text from first load)
    setInitialHtml(latestContentRef.current.html)
    setPresence({ scope: '', list: [] })
    setRoomRole(role)
    setRoomBinding({ documentId: docIdRef.current, code })
    if (code) writeRole(user, code, role)
    if (role === 'host' && !collab) removeCollab(docIdRef.current) // a fresh private room is not a collab file (yet)
    if (collab) markCollab(role, code) // a room that was created or joined on purpose
    if (docIdRef.current) {
      try {
        if (code) localStorage.setItem(roomKey(docIdRef.current), code)
        else localStorage.removeItem(roomKey(docIdRef.current))
      } catch {
        // ignore storage errors
      }
      // the server remembers which room this document belongs to (for the offline marks)
      saveDocument(docIdRef.current, { roomCode: code || null })
        .then(() => refreshFlagsRef.current())
        .catch(() => { })
    }
    if (code) addRecentRoom(code)
  }

  // Used by the join box (top right) and by "Collab Files". Returns true when it worked.
  const handleJoinRoom = (raw) => {
    const code = parseRoomInput(raw)
    if (code.length < 4) {
      showToast('That is not a valid room code or link', 'error')
      return false
    }
    if (loadState !== 'ready') {
      showToast('Please wait for the document to finish loading', 'error')
      return false
    }
    if (code === roomCode) {
      showToast(`You are already in room ${code}`)
      return true
    }
    const ok = window.confirm(
      `Join room ${code}?\n\nThis document will show that room's live content, and your document is updated with it as soon as you edit.`
    )
    if (!ok) return false
    const join = async () => {
      const membership = await requestRoomMembership(code)
      const role = membership.role || readRole(user, code) || 'collab'
      applyRoom(code, role, true)
      showToast(
        role === 'collab' ? `Join request sent for room ${code}` : `Joined room ${code}`,
        'success'
      )
    }
    join().catch((error) => {
      if (error.status === 401) goToLogin()
      showToast(error.message || `Could not join room ${code}`, 'error')
    })
    return true
  }

  const handleNewRoomCode = async () => {
    const code = generateRoomCode()

    try {
      await createRoom(code, docIdRef.current)

      // MongoDB room successfully created. Now start its Yjs connection.
      applyRoom(code, 'host', true)

      showToast(`New room ${code} is ready - share the code or link`, 'success')
    } catch (error) {
      if (error.status === 401) goToLogin()
      showToast(error.message || 'Could not create room', 'error')
    }
  }

  // Leave the shared room and go back to your own private copy of the document
  const handleLeaveRoom = () => {
    if (loadState !== 'ready' || !roomCode) return
    const question =
      roomRole === 'host'
        ? `Leave room ${roomCode}?\n\nYou are the host. Everyone else stays in the room, but you will go back to a private copy of this document.`
        : `Leave room ${roomCode}?\n\nYou will go back to your own private copy of this document.`
    if (!window.confirm(question)) return
    if (roomAccess === 'granted') dirtyRef.current.html = true // keep the latest shared text in your own document
    flushSave()
    applyRoom('', 'host')
    showToast('You left the room. This document is private again.', 'success')
  }

  const roomLink = () => `${window.location.origin}/editor?room=${roomCode}`

  const handleCopyRoomCode = async () => {
    if (!roomCode) return
    const ok = await copyToClipboard(roomCode)
    if (!ok) return showToast('Could not copy - please copy it by hand', 'error')
    addRecentRoom(roomCode)
    markCollab(roomRole, roomCode)
    setRoomCodeCopied(true)
    setTimeout(() => setRoomCodeCopied(false), 2000)
  }

  const handleCopyRoomLink = async () => {
    if (!roomCode) return
    const ok = await copyToClipboard(roomLink())
    if (!ok) return showToast('Could not copy - please copy it by hand', 'error')
    addRecentRoom(roomCode)
    markCollab(roomRole, roomCode)
    setRoomLinkCopied(true)
    setTimeout(() => setRoomLinkCopied(false), 2000)
  }

  const clearRecentRooms = () => {
    try {
      localStorage.removeItem(RECENT_ROOMS_KEY)
    } catch {
      // ignore storage errors
    }
    setRecentRooms([])
  }

  // ---------------------------------------------------------------
  // SIDEBAR PANELS
  // ---------------------------------------------------------------
  const openPanel = (name) => setPanel((current) => (current === name ? null : name))

  // Search panel: fetch the list of documents each time it opens
  useEffect(() => {
    if (panel !== 'search') return
    let cancelled = false
    setSearchText('')
    listDocuments()
      .then((data) => {
        if (!cancelled) setAllDocs(data.documents || [])
      })
      .catch((err) => {
        if (err.status === 401) goToLogin()
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])

  const searchResults = searchText.trim()
    ? allDocs
        .filter((d) => (d.title || '').toLowerCase().includes(searchText.trim().toLowerCase()))
        .slice(0, 20)
    : []

  // ---------------------------------------------------------------
  // LOAD: no ?doc=  -> reopen your last document (or create one)
  //       ?doc=new  -> always create a fresh document
  // ---------------------------------------------------------------
  useEffect(() => {
    if (docId && docId !== 'new') return
    if (creatingRef.current) return
    creatingRef.current = true

    const openOrCreate = async () => {
      try {
        let id = null
        if (!docId) {
          try {
            id = localStorage.getItem(lastDocKey(user))
          } catch {
            id = null
          }
        }
        if (!id) {
          const data = await createDocument()
          id = data.document._id
        }
        setSearchParams({ doc: id }, { replace: true }) // puts ?doc=ID in the URL
      } catch (err) {
        if (err.status === 401) return goToLogin()
        setLoadError(err.message)
        setLoadState('error')
      } finally {
        creatingRef.current = false
      }
    }
    openOrCreate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // ---------------------------------------------------------------
  // LOAD: GET the document from MongoDB, then render the Editor
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!docId || docId === 'new') return
    let cancelled = false

    setLoadState('loading')
    setSaveStatus('Loading...')
    setSaveProgress(0)
    // Nothing of the previous document's room may stay behind: the next document starts with no room,
    // no people, no role and no access until its own room is known.
    setPresence({ scope: '', list: [] })
    setAccessState({ scope: '', value: 'granted' })
    setRoomRole('host')
    setRoomBinding({ documentId: docId, code: '' })
    setRoomJoinRequests([])

    getDocument(docId)
      .then(async (data) => {
        if (cancelled) return
        const html = data.html || ''

        docIdRef.current = docId
        titleRef.current = data.document.title
        latestContentRef.current = { html, text: htmlToPlainText(html) }
        dirtyRef.current = { html: false, title: false, toolState: false }

        // Check the URL invite first, then MongoDB and local storage. A candidate
        // is used only if the authenticated REST lookup confirms its Room exists.
        const fromLink = cleanRoom(pendingRoomRef.current)
        pendingRoomRef.current = null
        let localCode = ''
        try {
          localCode = cleanRoom(localStorage.getItem(roomKey(docId)))
        } catch {
          localCode = ''
        }
        const persistedCode = cleanRoom(data.document.roomCode)
        const candidates = [...new Set([fromLink, persistedCode, localCode]
          .filter((candidate) => candidate.length >= 4))]
        let code = ''
        let role = 'host'
        let roomExists = false

        for (const candidate of candidates) {
          try {
            const membership = await requestRoomMembership(candidate)
            code = candidate
            roomExists = true
            role = membership.role || readRole(user, candidate) || 'collab'
            break
          } catch (error) {
            // A stale URL, MongoDB, or local-storage code is not a room unless the
            // authenticated REST lookup finds its Room. Try the next saved source.
            if (error.status !== 404) throw error
          }
        }
        const isCollaborative = roomExists && !!code
        if (cancelled) return
        try {
          if (code) localStorage.setItem(roomKey(docId), code)
          else localStorage.removeItem(roomKey(docId))
        } catch {
          // ignore storage errors
        }
        if (code) writeRole(user, code, role)
        setRoomRole(role)
        setRoomBinding({ documentId: docId, code: isCollaborative ? code : '' })
        if ((data.document.roomCode || null) !== (code || null)) {
          // the server remembers which room this document belongs to (for the offline marks)
          saveDocument(docId, { roomCode: code || null })
            .then(() => refreshFlagsRef.current())
            .catch(() => { })
        }
        if (fromLink.length >= 4 && code) {
          addRecentRoom(code)
          showToast(`Joined room ${code}`, 'success')
        }

        setTitle(data.document.title)
        setLoadedDocId(docId)
        updateCounts(latestContentRef.current.text)
        setInitialHtml(html)
        // Restore persisted toolbar state from the backend
        if (data.toolState && typeof data.toolState === 'object') {
          toolStateRef.current = data.toolState
          setInitialToolState(data.toolState)
        } else {
          toolStateRef.current = null
          setInitialToolState(null)
        }
        setSaveStatus('All changes saved')
        setSaveProgress(100)
        setLoadState('ready')

        try {
          localStorage.setItem(lastDocKey(user), docId)
        } catch {
          // ignore storage errors
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 401) return goToLogin()
        if (err.status === 404) {
          try {
            localStorage.removeItem(lastDocKey(user)) // forget a document that no longer exists
          } catch {
            // ignore storage errors
          }
        }
        setLoadError(err.message)
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  // ---------------------------------------------------------------
  // SAVE: debounced PUT to the backend (-> MongoDB)
  // ---------------------------------------------------------------
  async function performSave() {
    const id = docIdRef.current
    const dirty = dirtyRef.current
    if (!id || (!dirty.html && !dirty.title && !dirty.toolState)) return

    // Only one request at a time. If one is running, it re-checks for new edits when it ends.
    if (isSavingRef.current) return
    isSavingRef.current = true

    const payload = {}
    if (dirty.html) payload.html = latestContentRef.current.html
    if (dirty.title) payload.title = titleRef.current
    if (dirty.toolState && toolStateRef.current) payload.toolState = toolStateRef.current
    dirtyRef.current = { html: false, title: false, toolState: false } // edits made from now on mark it dirty again

    setSaveStatus('Saving...')
    setSaveProgress(30)
    let failed = null
    try {
      setSaveProgress(60)
      await saveDocument(id, payload)
      setSaveProgress(100)
    } catch (err) {
      failed = err
      // put the flags back so the retry sends this content again
      if (payload.html !== undefined) dirtyRef.current.html = true
      if (payload.title !== undefined) dirtyRef.current.title = true
      if (payload.toolState !== undefined) dirtyRef.current.toolState = true
      setSaveProgress(0)
    }
    isSavingRef.current = false

    if (failed) {
      if (failed.status === 401) return goToLogin()
      const canRetry = !failed.status || failed.status >= 500
      setSaveStatus(canRetry ? 'Save failed - retrying...' : `Could not save: ${failed.message}`)
      if (canRetry) retryTimerRef.current = setTimeout(() => performSave(), RETRY_DELAY)
      return
    }

    if (dirtyRef.current.html || dirtyRef.current.title || dirtyRef.current.toolState) {
      // the user kept typing while we were saving
      setSaveStatus('Unsaved changes...')
      setSaveProgress(10)
      debounceTimerRef.current = setTimeout(() => performSave(), SAVE_DELAY)
    } else {
      setSaveStatus('All changes saved')
      setSaveProgress(100)
    }
  }

  const scheduleSave = () => {
    setSaveStatus('Unsaved changes...')
    setSaveProgress(10)
    clearTimeout(debounceTimerRef.current)
    clearTimeout(retryTimerRef.current)
    debounceTimerRef.current = setTimeout(() => performSave(), SAVE_DELAY)
  }

  // Sends anything unsaved right now (used when leaving the page). `keepalive`
  // lets the request finish even while the tab is closing.
  const flushSave = () => {
    clearTimeout(debounceTimerRef.current)
    clearTimeout(retryTimerRef.current)
    const id = docIdRef.current
    const dirty = dirtyRef.current
    if (!id || (!dirty.html && !dirty.title && !dirty.toolState)) return

    const payload = {}
    if (dirty.html) payload.html = latestContentRef.current.html
    if (dirty.title) payload.title = titleRef.current
    if (dirty.toolState && toolStateRef.current) payload.toolState = toolStateRef.current
    dirtyRef.current = { html: false, title: false, toolState: false }
    saveDocument(id, payload, { keepalive: true }).catch(() => { })
  }

  // Keep a fresh copy of flushSave for the listeners below
  const flushSaveRef = useRef(flushSave)
  flushSaveRef.current = flushSave

  useEffect(() => {
    const onPageHide = () => flushSaveRef.current()
    window.addEventListener('pagehide', onPageHide) // tab closed / page reloaded
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      flushSaveRef.current() // leaving this page inside the app
    }
  }, [])

  const handleLogout = () => {
    flushSave() // save first, while the login token still exists
    goToLogin()
  }

  // You typed or used a toolbar button
  const handleContentChange = ({ html, text }) => {
    latestContentRef.current = { html, text }
    dirtyRef.current.html = true
    updateCounts(text)
    scheduleSave()
  }

  // Another user changed the shared document: keep counts and our copy current, but do not save
  const handleRemoteChange = ({ html, text }) => {
    latestContentRef.current = { html, text }
    updateCounts(text)
  }

  // Another collaborator renamed the shared document: show it and keep it in our own saved copy
  const handleRemoteTitle = (newTitle) => {
    if (!docIdRef.current || newTitle === titleRef.current) return
    titleRef.current = newTitle
    dirtyRef.current.title = true
    setTitle(newTitle)
    scheduleSave()
  }

  // Live title sync through the same room the editor uses
  const { publishTitle } = useSharedTitle({
  enabled: currentDocumentReady && !!yjsConnection,
  docId: loadedDocId,
  roomCode,
  role: roomRole,
  access: roomAccess,
  getTitle: () => titleRef.current,
  onRemoteTitle: handleRemoteTitle,
  onSynced: handleRoomSynced,
  ydoc: yjsConnection?.ydoc,
  provider: yjsConnection?.provider,
})

  const handleTitleChange = (newTitle) => {
    setTitle(newTitle)

    if (newTitle === titleRef.current) return

    titleRef.current = newTitle
    dirtyRef.current.title = true

    publishTitle(newTitle)
    scheduleSave()
  }

  const handleToolStateChange = (partialToolState) => {
    toolStateRef.current = { ...(toolStateRef.current || {}), ...partialToolState }
    dirtyRef.current.toolState = true
    scheduleSave()
  }

  // ---------------------------------------------------------------
  // FILE EXPLORER callbacks
  // ---------------------------------------------------------------

  // A file was clicked (or just created) in the explorer
  const handleOpenDocument = (id) => {
    if (id === docId) return
    flushSave() // save the document we are leaving, so nothing typed in the last second is lost
    setSearchParams({ doc: id })
  }

  // A file was renamed in the explorer: update the title bar if it is the open document
  const handleDocumentRenamed = (id, newTitle) => {
    setCollabDocs((prev) =>
      prev.some((e) => e.id === id && e.title !== newTitle)
        ? prev.map((e) => (e.id === id ? { ...e, title: newTitle } : e))
        : prev
    )
    if (id !== docIdRef.current) return
    titleRef.current = newTitle
    dirtyRef.current.title = false
    setTitle(newTitle)
    publishTitle(newTitle)
  }

  // The open document was deleted (directly, or because its folder was deleted)
  const handleActiveDeleted = (deletedId, nextId) => {
    clearTimeout(debounceTimerRef.current)
    clearTimeout(retryTimerRef.current)
    dirtyRef.current = { html: false, title: false, toolState: false } // never save into a deleted document
    docIdRef.current = null
    removeCollab(deletedId, false)
    try {
      localStorage.removeItem(lastDocKey(user))
    } catch {
      // ignore storage errors
    }
    setLoadedDocId(null)
    setLoadState('loading')
    setSaveStatus('Loading...')
    setSaveProgress(0)
    // open another file, or start a fresh one if none is left
    setSearchParams({ doc: nextId || 'new' }, { replace: true })
  }

  // Determine save status class
  const getSaveStatusClass = () => {
    if (saveStatus === 'All changes saved') return 'saved'
    if (saveStatus === 'Saving...') return 'saving'
    if (saveStatus.includes('failed') || saveStatus.includes('Could not')) return 'error'
    return 'pending'
  }

  const navClass = (name) => `sidebar-nav-item ${(panel || 'explorer') === name ? 'active' : ''}`

  return (
    <div className="editor-page">
      {/* ===================== SIDEBAR ===================== */}
      <aside className={`editor-sidebar ${sidebarOpen ? '' : 'editor-sidebar-hidden'}`}>
        <div className="sidebar-brand">
          <LogoIcon />
          <span className="sidebar-brand-text">SyncDoc</span>
        </div>

        <nav className="sidebar-nav">
          <button type="button" className={navClass('explorer')} onClick={() => setPanel(null)}>
            <FolderIcon />
            <span>Explorer</span>
          </button>
          <button type="button" className={navClass('search')} onClick={() => openPanel('search')}>
            <SearchIcon />
            <span>Search</span>
          </button>
          <button type="button" className={navClass('collab')} onClick={() => openPanel('collab')}>
            <UsersIcon />
            <span>Collab Files</span>
          </button>
          <button type="button" className={navClass('room')} onClick={() => openPanel('room')}>
            <LinkIcon />
            <span>Room ID Generator</span>
          </button>
        </nav>

        {/* ---- Search panel ---- */}
        {panel === 'search' && (
          <div className="sidebar-panel">
            <input
              className="panel-input"
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search your documents..."
              aria-label="Search documents"
            />
            <div className="panel-list">
              {!searchText.trim() && <p className="panel-empty">Type a name to find a document.</p>}
              {searchText.trim() && searchResults.length === 0 && <p className="panel-empty">No documents found.</p>}
              {searchResults.map((d) => (
                <button
                  type="button"
                  key={d._id}
                  className={`panel-item ${d._id === docId ? 'active' : ''}`}
                  onClick={() => {
                    handleOpenDocument(d._id)
                    setPanel(null)
                  }}
                >
                  <FileSmallIcon />
                  <span className="panel-item-label">{d.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Collab Files panel (rooms you shared or joined) ---- */}
        {panel === 'collab' && (
          <div className="sidebar-panel">
            <div className="panel-title-row">
              <span className="panel-title">Your rooms</span>
              {recentRooms.length > 0 && (
                <button type="button" className="panel-link" onClick={clearRecentRooms}>
                  Clear
                </button>
              )}
            </div>
            <div className="panel-list">
              {recentRooms.length === 0 && (
                <p className="panel-empty">Rooms you create, copy or join show up here for one-click rejoining.</p>
              )}
              {recentRooms.map((r) => (
                <button
                  type="button"
                  key={r.code}
                  className={`panel-item ${r.code === roomCode ? 'active' : ''}`}
                  onClick={() => handleJoinRoom(r.code)}
                  title={`Join room ${r.code}`}
                >
                  <UsersIcon />
                  <span className="panel-item-label">
                    <b className="panel-code">{r.code}</b>
                    <small>{r.title}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Room ID Generator panel ---- */}
        {panel === 'room' && (
          <div className="sidebar-panel">
            <div className="panel-title-row">
              <span className="panel-title">{roomCode ? 'Current room' : 'Collaboration room'}</span>
            </div>
            {roomCode ? (
              <>
                <div className="room-code-display">
                  <code className="room-code-value">{roomCode}</code>
                  <button
                    type="button"
                    className="room-code-copy"
                    onClick={handleCopyRoomCode}
                    title={roomCodeCopied ? 'Copied!' : 'Copy code'}
                  >
                    {roomCodeCopied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
                <button type="button" className="room-code-link" onClick={handleCopyRoomLink}>
                  {roomLinkCopied ? <CheckIcon /> : <LinkIcon />}
                  <span>{roomLinkCopied ? 'Link copied!' : 'Copy invite link'}</span>
                </button>
                <p className="panel-note">Anyone who enters this code (or opens the link) edits this document live with you.</p>
              </>
            ) : (
              <p className="panel-note">This document is private. Create a room when you are ready to collaborate.</p>
            )}
            <button type="button" className="room-code-new" onClick={handleNewRoomCode}>
              {roomCode ? 'Generate new room' : 'Create collaboration room'}
            </button>
          </div>
        )}

        <div className="sidebar-divider" />

        {/* ---- Collab Files (documents you share or joined - they also stay in Files & Documents) ---- */}
        <div className="sidebar-collab-section">
          <div className="sidebar-collab-head">
            <span className="sidebar-collab-title">Collab Files</span>
            <span className="sidebar-collab-count">{collabDocs.length}</span>
          </div>
          <div className="collab-file-list">
            {collabDocs.length === 0 && (
              <p className="panel-empty">Documents you share or join with others appear here.</p>
            )}
            {collabDocs.map((e) => (
              <button
                type="button"
                key={e.id}
                className={`collab-file ${e.id === docId ? 'active' : ''}`}
                onClick={() => handleOpenDocument(e.id)}
                title={`${e.title} - room ${e.room}`}
              >
                <span
                  className="collab-dot"
                  style={{ background: e.role === 'host' ? HOST_COLOR : 'var(--color-primary)' }}
                />
                <FileSmallIcon />
                <span className="panel-item-label">
                  <b>{e.title}</b>
                  <small>
                    Room {e.room}
                    {e.role === 'host' ? ' · Host' : ' · Collaborator'}
                  </small>
                </span>
                {offlineDocIds.includes(e.id) && (
                  <span style={OFFLINE_FLAG_STYLE} title="Changed while you were offline" aria-label="Changed while you were offline">
                    !
                  </span>
                )}
                {e.role === 'host' && (
                  <span className="collab-host-badge" title="You are the host">
                    <CrownIcon />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ---- File Explorer ("Files & Documents") ---- */}
        <div className="sidebar-files-section">
          <FileExplorer
            activeDocId={docId}
            offlineDocIds={offlineDocIds}
            titleInfo={loadedDocId ? { id: loadedDocId, title } : null}
            onOpenDocument={handleOpenDocument}
            onDocumentRenamed={handleDocumentRenamed}
            onActiveDeleted={handleActiveDeleted}
            onUnauthorized={goToLogin}
          />
        </div>
      </aside>

      {/* ===================== MAIN ===================== */}
      <div className="editor-main-wrapper">
        <TitleBar
          title={title}
          onTitleChange={handleTitleChange}
          user={user}
          onLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          peers={peers}
          collabActive={collabActive}
          roomCode={roomCode}
          role={roomRole}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={handleLeaveRoom}
        />

        <main className="editor-page-main">
          <div className={`editor-container ${collabActive ? '' : 'collab-off'}`}>
            {/* Solo document (no active room): hide every collaborator colour mark */}
            <style>{`
              .editor-container.collab-off .editor-content [data-author] {
                box-shadow: none !important;
                background-image: none !important;
                padding-left: 0 !important;
              }
              .editor-container.collab-off .author-legend {
                display: none !important;
              }
            `}</style>
            {currentDocumentReady && (
              <Editor
                key={`${docId}-${editorRoomCode}`}
                documentId={docId}
                documentTitle={title}
                roomCode={editorRoomCode}
                role={roomRole}
                user={user}
                initialHtml={initialHtml}
                initialToolState={initialToolState}
                onChange={handleContentChange}
                onRemoteChange={handleRemoteChange}
                onToolStateChange={handleToolStateChange}
                onPresenceChange={handlePresenceChange}
                onAccessChange={handleAccessChange}
                onNotify={showToast}
                onYjsReady={setYjsConnection}
                pendingRoomMembers={roomJoinRequests}
              />
            )}

            {loadState === 'loading' && (
              <div className="editor-loading-state">
                <div className="loading-spinner"></div>
                <p>Loading your document...</p>
              </div>
            )}

            {loadState === 'error' && (
              <div className="editor-error-state">
                <div className="error-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="error-title">Could not open the document</p>
                <p className="error-message">{loadError}</p>
                <p className="error-hint">
                  Pick a file from the sidebar, or open <code>/editor?doc=new</code> to start a new document.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* ===================== FOOTER ===================== */}
        <footer className="editor-footer">
          <div className="footer-left">
            <span className="footer-status-dot"></span>
            <span className="footer-user-name">
              Logged in as <b>{user?.name || 'User'}</b>
            </span>
            {collabActive && (
              <>
                <span className="footer-divider"></span>
                <span className="footer-collaborators">
                  {collaboratorCount} collaborator{collaboratorCount === 1 ? '' : 's'} online
                </span>
              </>
            )}
          </div>

          <div className="footer-center">
            <span className="footer-word-count">{wordCount} words</span>
            <span className="footer-char-count">{charCount} chars</span>
          </div>

          <div className="footer-right">
            <div className={`footer-save-indicator ${getSaveStatusClass()}`}>
              <CloudIcon />
              <span className="footer-save-text">{saveStatus}</span>
              <div className="footer-save-progress">
                <div className="footer-save-progress-bar" style={{ width: `${saveProgress}%` }}></div>
              </div>
            </div>

            <div className="theme-switch" role="group" aria-label="Colour theme">
              <button
                type="button"
                className={theme === 'light' ? 'on' : ''}
                onClick={() => setTheme('light')}
                aria-label="Light mode"
                title="Light mode"
              >
                <SunIcon />
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'on' : ''}
                onClick={() => setTheme('dark')}
                aria-label="Dark mode"
                title="Dark mode"
              >
                <MoonIcon />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Pop-up message */}
      {toast && (
        <div className={`app-toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default EditorPage
