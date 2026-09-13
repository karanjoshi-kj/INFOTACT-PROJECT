import { useState, useEffect } from 'react'
import TitleBar from '../components/Layout/TitleBar.jsx'
import Editor from '../components/Editor/Editor.jsx'
import './EditorPage.css'

function EditorPage() {
  const [title, setTitle] = useState('Untitled Document')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('All changes saved')
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)

  // Handle typing and auto-save simulation
  const handleContentChange = (newContent) => {
    setContent(newContent)
    setSaveStatus('Unsaved changes...')
    
    // Calculate words and characters
    const words = newContent.trim() ? newContent.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(newContent.length)

    // Simulate auto-save after 1 second of inactivity
    clearTimeout(window.saveTimer)
    window.saveTimer = setTimeout(() => {
      setSaveStatus('Saving...')
      setTimeout(() => {
        setSaveStatus('All changes saved')
      }, 600)
    }, 1000)
  }

  return (
    <div className="editor-page">
      <TitleBar 
        title={title} 
        onTitleChange={setTitle} 
        saveStatus={saveStatus} 
      />
      
      <main className="editor-page-main">
        <div className="editor-container">
          {/* Editor component ko content aur handler pass kar rahe hain */}
          <Editor value={content} onChange={handleContentChange} />
        </div>
      </main>

      {/* Professional Footer with stats */}
      <footer className="editor-footer">
        <div className="editor-stats">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{charCount} characters</span>
        </div>
        <div className="editor-sync-indicator">
          <span className={`status-dot ${saveStatus === 'All changes saved' ? 'saved' : 'saving'}`}></span>
          <span>{saveStatus}</span>
        </div>
      </footer>
    </div>
  )
}

export default EditorPage