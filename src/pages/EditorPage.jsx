import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TitleBar from '../components/Layout/TitleBar.jsx'
import Editor from '../components/Editor/Editor.jsx'
import FileExplorer from '../components/Sidebar/FileExplorer.jsx'
import { getUser, clearSession } from '../utils/auth.js'
import { createDocument, getDocument, saveDocument } from '../services/api.js'
import './EditorPage.css'

const SAVE_DELAY = 1000 // ms of no typing before we save (the "debounce")
const RETRY_DELAY = 4000 // ms before retrying a failed save

const SunIcon = () => (
  <svg className="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const MoonIcon = () => (
  <svg className="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

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

function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const docId = searchParams.get('doc') // /editor?doc=ID

  const [title, setTitle] = useState('Untitled Document')
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('')
  const [initialHtml, setInitialHtml] = useState('')
  const [saveStatus, setSaveStatus] = useState('Loading...')
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [theme, setTheme] = useState(getInitialTheme)
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [loadedDocId, setLoadedDocId] = useState(null) // the document whose title is in `title`
  const navigate = useNavigate()
  const user = getUser()

  // Always holds the newest { html, text } from the editor.
  const latestContentRef = useRef({ html: '', text: '' })
  const titleRef = useRef('Untitled Document')
  const docIdRef = useRef(null) // the document that is currently loaded
  const dirtyRef = useRef({ html: false, title: false }) // what still needs saving
  const debounceTimerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const isSavingRef = useRef(false)
  const creatingRef = useRef(false) // stops React StrictMode from creating 2 documents

  // Apply theme to the whole document and remember the choice
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('syncdoc-theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

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

  const goToLogin = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

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

    getDocument(docId)
      .then((data) => {
        if (cancelled) return
        const html = data.html || ''

        docIdRef.current = docId
        titleRef.current = data.document.title
        latestContentRef.current = { html, text: htmlToPlainText(html) }
        dirtyRef.current = { html: false, title: false }

        setTitle(data.document.title)
        setLoadedDocId(docId)
        updateCounts(latestContentRef.current.text)
        setInitialHtml(html)
        setSaveStatus('All changes saved')
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
    if (!id || (!dirty.html && !dirty.title)) return

    // Only one request at a time. If one is running, it re-checks for new edits when it ends.
    if (isSavingRef.current) return
    isSavingRef.current = true

    const payload = {}
    if (dirty.html) payload.html = latestContentRef.current.html
    if (dirty.title) payload.title = titleRef.current
    dirtyRef.current = { html: false, title: false } // edits made from now on mark it dirty again

    setSaveStatus('Saving...')
    let failed = null
    try {
      await saveDocument(id, payload)
    } catch (err) {
      failed = err
      // put the flags back so the retry sends this content again
      if (payload.html !== undefined) dirtyRef.current.html = true
      if (payload.title !== undefined) dirtyRef.current.title = true
    }
    isSavingRef.current = false

    if (failed) {
      if (failed.status === 401) return goToLogin()
      const canRetry = !failed.status || failed.status >= 500
      setSaveStatus(canRetry ? 'Save failed - retrying...' : `Could not save: ${failed.message}`)
      if (canRetry) retryTimerRef.current = setTimeout(() => performSave(), RETRY_DELAY)
      return
    }

    if (dirtyRef.current.html || dirtyRef.current.title) {
      // the user kept typing while we were saving
      setSaveStatus('Unsaved changes...')
      debounceTimerRef.current = setTimeout(() => performSave(), SAVE_DELAY)
    } else {
      setSaveStatus('All changes saved')
    }
  }

  const scheduleSave = () => {
    setSaveStatus('Unsaved changes...')
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
    if (!id || (!dirty.html && !dirty.title)) return

    const payload = {}
    if (dirty.html) payload.html = latestContentRef.current.html
    if (dirty.title) payload.title = titleRef.current
    dirtyRef.current = { html: false, title: false }
    saveDocument(id, payload, { keepalive: true }).catch(() => {})
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

  const handleTitleChange = (newTitle) => {
    setTitle(newTitle)
    if (newTitle === titleRef.current) return
    titleRef.current = newTitle
    dirtyRef.current.title = true
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
    if (id !== docIdRef.current) return
    titleRef.current = newTitle
    dirtyRef.current.title = false
    setTitle(newTitle)
  }

  // The open document was deleted (directly, or because its folder was deleted)
  const handleActiveDeleted = (deletedId, nextId) => {
    clearTimeout(debounceTimerRef.current)
    clearTimeout(retryTimerRef.current)
    dirtyRef.current = { html: false, title: false } // never save into a deleted document
    docIdRef.current = null
    try {
      localStorage.removeItem(lastDocKey(user))
    } catch {
      // ignore storage errors
    }
    setLoadedDocId(null)
    setLoadState('loading')
    setSaveStatus('Loading...')
    // open another file, or start a fresh one if none is left
    setSearchParams({ doc: nextId || 'new' }, { replace: true })
  }

  return (
    <div className="editor-page">
      <TitleBar
        title={title}
        onTitleChange={handleTitleChange}
        user={user}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      <div className="editor-body">
        <aside className={`editor-sidebar ${sidebarOpen ? '' : 'editor-sidebar-hidden'}`}>
          <FileExplorer
            activeDocId={docId}
            titleInfo={loadedDocId ? { id: loadedDocId, title } : null}
            onOpenDocument={handleOpenDocument}
            onDocumentRenamed={handleDocumentRenamed}
            onActiveDeleted={handleActiveDeleted}
            onUnauthorized={goToLogin}
          />
        </aside>

        <main className="editor-page-main">
          <div className="editor-container">
            {loadState === 'ready' && (
              <Editor
                key={docId}
                documentId={docId}
                initialHtml={initialHtml}
                onChange={handleContentChange}
                onRemoteChange={handleRemoteChange}
              />
            )}

            {loadState === 'loading' && (
              <p style={{ padding: '2rem 3rem', color: 'var(--color-text-muted)' }}>
                Loading your document...
              </p>
            )}

            {loadState === 'error' && (
              <div style={{ padding: '2rem 3rem' }}>
                <p>Could not open the document: {loadError}</p>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  Pick a file from the list on the left, or open <code>/editor?doc=new</code> to
                  start a new document.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer with stats and save-status tracker */}
      <footer className="editor-footer">
        <div className="editor-stats">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{charCount} characters</span>
        </div>
        <div className="editor-sync-indicator" aria-live="polite">
          <span
            className={`status-dot ${saveStatus === 'All changes saved' ? 'saved' : 'saving'}`}
            aria-hidden="true"
          ></span>
          <span>{saveStatus}</span>
        </div>
      </footer>

      <button
        type="button"
        className="theme-toggle-btn"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  )
}

export default EditorPage