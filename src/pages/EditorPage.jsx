import { useState } from 'react'
import TitleBar from '../components/Layout/TitleBar.jsx'
import Editor from '../components/Editor/Editor.jsx'
import './EditorPage.css'

function EditorPage() {
  const [title, setTitle] = useState('Untitled Document')

  return (
    <div className="editor-page">
      <TitleBar title={title} onTitleChange={setTitle} />
      <main className="editor-page-main">
        <Editor />
      </main>
    </div>
  )
}

export default EditorPage