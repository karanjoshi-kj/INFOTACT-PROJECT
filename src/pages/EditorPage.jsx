import { useState, useEffect, useRef } from 'react'
import TitleBar from '../components/Layout/TitleBar.jsx'
import Editor from '../components/Editor/Editor.jsx'
import './EditorPage.css'

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
  const stored = localStorage.getItem('syncdoc-theme')
  return stored === 'dark' ? 'dark' : 'light'
}

function EditorPage() {
  const [title, setTitle] = useState('Untitled Document')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('All changes saved')
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [theme, setTheme] = useState(getInitialTheme)

  const debounceTimerRef = useRef(null)
  const savingTimerRef = useRef(null)

  // Apply theme to the whole document and remember the choice
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('syncdoc-theme', theme)
  }, [theme])

  // Clear any pending auto-save timers if the page unmounts mid-sequence
  useEffect(() => {
    return () => {
      clearTimeout(debounceTimerRef.current)
      clearTimeout(savingTimerRef.current)
    }
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  // Handle typing and auto-save simulation
  const handleContentChange = (newContent) => {
    setContent(newContent)
    setSaveStatus('Unsaved changes...')

    // Calculate words and characters
    const words = newContent.trim() ? newContent.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(newContent.length)

    // Simulate auto-save after 1 second of inactivity
    clearTimeout(debounceTimerRef.current)
    clearTimeout(savingTimerRef.current)

    debounceTimerRef.current = setTimeout(() => {
      setSaveStatus('Saving...')
      savingTimerRef.current = setTimeout(() => {
        setSaveStatus('All changes saved')
      }, 600)
    }, 1000)
  }

  return (
    <div className="editor-page">
      <TitleBar
        title={title}
        onTitleChange={setTitle}
      />

      <main className="editor-page-main">
        <div className="editor-container">
          {/* Passing content and the change handler down to the Editor component */}
          <Editor value={content} onChange={handleContentChange} />
        </div>
      </main>

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