import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  listDocuments,
  listFolders,
  createDocument,
  createFolder,
  saveDocument,
  updateFolder,
  deleteDocument,
  deleteFolder,
} from '../../services/api.js'
import './FileExplorer.css'

const EXPANDED_KEY = 'syncdoc-expanded-folders'

// ---------- icons ----------
const Svg = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const FileIcon = () => (
  <Svg>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </Svg>
)
const NewFileIcon = () => (
  <Svg>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </Svg>
)
const FolderIcon = () => (
  <Svg>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Svg>
)
const FolderOpenIcon = () => (
  <Svg>
    <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </Svg>
)
const NewFolderIcon = () => (
  <Svg>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <line x1="9" y1="13" x2="15" y2="13" />
  </Svg>
)
const ChevronIcon = () => (
  <Svg size={14}>
    <polyline points="9 18 15 12 9 6" />
  </Svg>
)
const RefreshIcon = () => (
  <Svg>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <polyline points="21 3 21 8 16 8" />
  </Svg>
)
const CollapseAllIcon = () => (
  <Svg>
    <polyline points="7 4 12 9 17 4" />
    <polyline points="7 20 12 15 17 20" />
  </Svg>
)
const PencilIcon = () => (
  <Svg size={14}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </Svg>
)
const TrashIcon = () => (
  <Svg size={14}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
)

// ---------- small helpers ----------
const readExpanded = () => {
  try {
    const list = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]')
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

const byName = (a, b) =>
  (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '', undefined, {
    numeric: true,
    sensitivity: 'base',
  })

// Inline text box used for "new file", "new folder" and "rename" (like VS Code)
function NameInput({ initial = '', kind, depth, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef(null)
  const doneRef = useRef(false) // Enter + the blur that follows must only count once

  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  const finish = (commit) => {
    if (doneRef.current) return
    doneRef.current = true
    const name = value.trim()
    if (commit && name) onSubmit(name)
    else onCancel()
  }

  return (
    <div className="fx-row fx-row-input" style={{ paddingLeft: 8 + depth * 14 }}>
      <span className="fx-chevron fx-chevron-space" />
      <span className={`fx-icon ${kind === 'folder' ? 'fx-icon-folder' : 'fx-icon-file'}`}>
        {kind === 'folder' ? <FolderIcon /> : <FileIcon />}
      </span>
      <input
        ref={inputRef}
        className="fx-input"
        value={value}
        placeholder={kind === 'folder' ? 'Folder name' : 'File name'}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') finish(true)
          else if (e.key === 'Escape') finish(false)
        }}
        onBlur={() => finish(true)}
      />
    </div>
  )
}

// ---------- the explorer ----------
function FileExplorer({
  activeDocId, // the document open in the editor
  titleInfo, // { id, title } of the open document, keeps the list in sync when you rename it in the title bar
  onOpenDocument, // (id) => open that document in the editor
  onDocumentRenamed, // (id, title) => a file was renamed from the explorer
  onActiveDeleted, // (deletedId, nextId|null) => the open document was deleted
  onUnauthorized, // () => the login expired
}) {
  const [folders, setFolders] = useState([])
  const [docs, setDocs] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [errorText, setErrorText] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(readExpanded)
  const [selected, setSelected] = useState(null) // { kind: 'file' | 'folder', id }
  const [creating, setCreating] = useState(null) // { kind, parentId }
  const [renaming, setRenaming] = useState(null) // { kind, id }
  const [menu, setMenu] = useState(null) // { x, y, target: {kind,id} | null }
  const [dropTarget, setDropTarget] = useState(null) // folder id | 'root'

  const dragRef = useRef(null)
  const docsRef = useRef(docs)
  docsRef.current = docs
  const statusRef = useRef(status)
  statusRef.current = status
  const propsRef = useRef({})
  propsRef.current = { onOpenDocument, onDocumentRenamed, onActiveDeleted, onUnauthorized, activeDocId }

  const showError = useCallback((err) => {
    if (err.status === 401) {
      propsRef.current.onUnauthorized?.()
      return
    }
    setNotice(err.message || 'Something went wrong')
  }, [])

  // ---------- load everything from MongoDB ----------
  const load = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([listFolders(), listDocuments()])
      setFolders(f.folders || [])
      setDocs(d.documents || [])
      setStatus('ready')
    } catch (err) {
      if (err.status === 401) {
        propsRef.current.onUnauthorized?.()
        return
      }
      if (statusRef.current === 'ready') {
        setNotice(err.message) // the list is still on screen, just tell the user
      } else {
        setErrorText(err.message)
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The list shows the open document's newest title (renamed in the title bar)
  const infoId = titleInfo?.id
  const infoTitle = titleInfo?.title
  useEffect(() => {
    if (!infoId || !infoTitle) return
    setDocs((prev) =>
      prev.some((d) => d._id === infoId && d.title !== infoTitle)
        ? prev.map((d) => (d._id === infoId ? { ...d, title: infoTitle } : d))
        : prev
    )
  }, [infoId, infoTitle])

  // A document that is open but not in the list yet (e.g. just auto-created) -> reload the list
  useEffect(() => {
    if (status !== 'ready' || !activeDocId || activeDocId === 'new') return
    if (!docsRef.current.some((d) => d._id === activeDocId)) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId])

  // Highlight the open file and open the folders that contain it
  useEffect(() => {
    if (status !== 'ready' || !activeDocId) return
    const doc = docs.find((d) => d._id === activeDocId)
    if (!doc) return
    const byId = new Map(folders.map((f) => [f._id, f]))
    const chain = []
    let fid = doc.folder
    while (fid && byId.has(fid) && !chain.includes(fid)) {
      chain.push(fid)
      fid = byId.get(fid).parent
    }
    if (chain.length) {
      setExpanded((prev) => {
        if (chain.every((id) => prev.has(id))) return prev
        const next = new Set(prev)
        chain.forEach((id) => next.add(id))
        return next
      })
    }
    setSelected({ kind: 'file', id: activeDocId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, status])

  // Remember which folders are open
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // ignore storage errors
    }
  }, [expanded])

  // Error messages disappear by themselves
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(t)
  }, [notice])

  // Close the right-click menu on click / Escape / resize
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // ---------- tree data ----------
  const { foldersByParent, docsByFolder } = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f._id))
    const fb = new Map()
    const db = new Map()
    for (const f of folders) {
      const key = f.parent && folderIds.has(f.parent) ? f.parent : 'root'
      if (!fb.has(key)) fb.set(key, [])
      fb.get(key).push(f)
    }
    for (const d of docs) {
      const key = d.folder && folderIds.has(d.folder) ? d.folder : 'root'
      if (!db.has(key)) db.set(key, [])
      db.get(key).push(d)
    }
    fb.forEach((list) => list.sort(byName))
    db.forEach((list) => list.sort(byName))
    return { foldersByParent: fb, docsByFolder: db }
  }, [folders, docs])

  // ---------- actions ----------
  const addExpanded = (id) => setExpanded((prev) => new Set(prev).add(id))

  // Where a new file/folder goes: inside the selected folder, next to the selected file, or at the top
  const currentParent = () => {
    if (!selected) return null
    if (selected.kind === 'folder') return selected.id
    const d = docs.find((x) => x._id === selected.id)
    return d && d.folder && folders.some((f) => f._id === d.folder) ? d.folder : null
  }

  const startCreate = (kind, parentId = currentParent()) => {
    setMenu(null)
    setRenaming(null)
    if (parentId) addExpanded(parentId)
    setCreating({ kind, parentId })
  }

  const submitCreate = async (name) => {
    const { kind, parentId } = creating
    setCreating(null)
    try {
      if (kind === 'file') {
        const data = await createDocument(name, parentId)
        const d = data.document
        setDocs((prev) => [
          ...prev,
          { _id: d._id, title: d.title, folder: d.folder || null, createdAt: d.createdAt, updatedAt: d.updatedAt },
        ])
        setSelected({ kind: 'file', id: d._id })
        propsRef.current.onOpenDocument(d._id)
      } else {
        const data = await createFolder(name, parentId)
        setFolders((prev) => [...prev, data.folder])
        setSelected({ kind: 'folder', id: data.folder._id })
      }
    } catch (err) {
      showError(err)
    }
  }

  const submitRename = async (name) => {
    const { kind, id } = renaming
    setRenaming(null)
    try {
      if (kind === 'file') {
        const current = docs.find((d) => d._id === id)
        if (!current || current.title === name) return
        await saveDocument(id, { title: name })
        setDocs((prev) => prev.map((d) => (d._id === id ? { ...d, title: name } : d)))
        propsRef.current.onDocumentRenamed?.(id, name)
      } else {
        const current = folders.find((f) => f._id === id)
        if (!current || current.name === name) return
        await updateFolder(id, { name })
        setFolders((prev) => prev.map((f) => (f._id === id ? { ...f, name } : f)))
      }
    } catch (err) {
      showError(err)
    }
  }

  const deleteItem = async (kind, id) => {
    setMenu(null)
    const target = kind === 'file' ? docs.find((d) => d._id === id) : folders.find((f) => f._id === id)
    if (!target) return
    const label = kind === 'file' ? target.title : target.name
    const question =
      kind === 'file'
        ? `Delete "${label}"? This cannot be undone.`
        : `Delete the folder "${label}" and everything inside it? This cannot be undone.`
    if (!window.confirm(question)) return

    try {
      let deletedDocIds = []
      if (kind === 'file') {
        await deleteDocument(id)
        deletedDocIds = [id]
        setDocs((prev) => prev.filter((d) => d._id !== id))
      } else {
        const data = await deleteFolder(id)
        const folderIds = new Set(data.deletedFolderIds)
        deletedDocIds = data.deletedDocumentIds || []
        setFolders((prev) => prev.filter((f) => !folderIds.has(f._id)))
        setDocs((prev) => prev.filter((d) => !deletedDocIds.includes(d._id)))
      }
      setSelected((prev) => (prev && (prev.id === id || deletedDocIds.includes(prev.id)) ? null : prev))

      const activeId = propsRef.current.activeDocId
      if (activeId && deletedDocIds.includes(activeId)) {
        const remaining = docs
          .filter((d) => !deletedDocIds.includes(d._id))
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        propsRef.current.onActiveDeleted?.(activeId, remaining[0]?._id || null)
      }
    } catch (err) {
      showError(err)
    }
  }

  // Is `candidateId` the folder `ancestorId` itself, or somewhere inside it?
  const isInside = (candidateId, ancestorId) => {
    const byId = new Map(folders.map((f) => [f._id, f]))
    let cur = candidateId
    const seen = new Set()
    while (cur && !seen.has(cur)) {
      if (cur === ancestorId) return true
      seen.add(cur)
      cur = byId.get(cur)?.parent || null
    }
    return false
  }

  const moveItem = async (kind, id, targetFolderId) => {
    try {
      if (kind === 'file') {
        const current = docs.find((d) => d._id === id)
        if (!current || (current.folder || null) === targetFolderId) return
        await saveDocument(id, { folder: targetFolderId })
        setDocs((prev) => prev.map((d) => (d._id === id ? { ...d, folder: targetFolderId } : d)))
      } else {
        const current = folders.find((f) => f._id === id)
        if (!current || (current.parent || null) === targetFolderId) return
        if (targetFolderId && isInside(targetFolderId, id)) {
          setNotice('A folder cannot be moved into itself')
          return
        }
        await updateFolder(id, { parent: targetFolderId })
        setFolders((prev) => prev.map((f) => (f._id === id ? { ...f, parent: targetFolderId } : f)))
      }
      if (targetFolderId) addExpanded(targetFolderId)
    } catch (err) {
      showError(err)
    }
  }

  const clickFolder = (id) => {
    setSelected({ kind: 'folder', id })
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clickFile = (id) => {
    setSelected({ kind: 'file', id })
    propsRef.current.onOpenDocument(id)
  }

  const openMenu = (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    if (target) setSelected(target)
    setMenu({ x: e.clientX, y: e.clientY, target })
  }

  const rowKeyDown = (e, kind, id) => {
    if (e.target !== e.currentTarget) return // ignore keys typed in inner buttons
    if (e.key === 'F2') {
      e.preventDefault()
      setCreating(null)
      setRenaming({ kind, id })
    } else if (e.key === 'Delete') {
      e.preventDefault()
      deleteItem(kind, id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (kind === 'folder') clickFolder(id)
      else clickFile(id)
    }
  }

  // ---------- drag & drop ----------
  const startDrag = (e, kind, id) => {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', id) // Firefox needs some data to start a drag
    e.dataTransfer.effectAllowed = 'move'
    dragRef.current = { kind, id }
  }

  const endDrag = () => {
    dragRef.current = null
    setDropTarget(null)
  }

  const allowDrop = (e, targetId) => {
    if (!dragRef.current) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const key = targetId || 'root'
    setDropTarget((prev) => (prev === key ? prev : key))
  }

  const handleDrop = (e, targetId) => {
    e.preventDefault()
    e.stopPropagation()
    const dragged = dragRef.current
    endDrag()
    if (dragged) moveItem(dragged.kind, dragged.id, targetId)
  }

  // ---------- rendering ----------
  const renderChildren = (parentKey, depth) => {
    const parentId = parentKey === 'root' ? null : parentKey
    const out = []

    if (creating && (creating.parentId || null) === parentId) {
      out.push(
        <NameInput
          key="__creating"
          kind={creating.kind}
          depth={depth}
          onSubmit={submitCreate}
          onCancel={() => setCreating(null)}
        />
      )
    }

    for (const f of foldersByParent.get(parentKey) || []) {
      const isOpen = expanded.has(f._id)
      if (renaming && renaming.kind === 'folder' && renaming.id === f._id) {
        out.push(
          <NameInput key={f._id} kind="folder" depth={depth} initial={f.name} onSubmit={submitRename} onCancel={() => setRenaming(null)} />
        )
      } else {
        out.push(
          <div
            key={f._id}
            role="treeitem"
            aria-expanded={isOpen}
            tabIndex={0}
            className={`fx-row ${selected?.id === f._id ? 'selected' : ''} ${dropTarget === f._id ? 'drop-target' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable
            onDragStart={(e) => startDrag(e, 'folder', f._id)}
            onDragEnd={endDrag}
            onDragOver={(e) => allowDrop(e, f._id)}
            onDrop={(e) => handleDrop(e, f._id)}
            onClick={() => clickFolder(f._id)}
            onContextMenu={(e) => openMenu(e, { kind: 'folder', id: f._id })}
            onKeyDown={(e) => rowKeyDown(e, 'folder', f._id)}
          >
            <span className={`fx-chevron ${isOpen ? 'open' : ''}`}>
              <ChevronIcon />
            </span>
            <span className="fx-icon fx-icon-folder">{isOpen ? <FolderOpenIcon /> : <FolderIcon />}</span>
            <span className="fx-label" title={f.name}>
              {f.name}
            </span>
            <span className="fx-actions">
              <button
                type="button"
                title="Rename (F2)"
                onClick={(e) => {
                  e.stopPropagation()
                  setCreating(null)
                  setRenaming({ kind: 'folder', id: f._id })
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteItem('folder', f._id)
                }}
              >
                <TrashIcon />
              </button>
            </span>
          </div>
        )
      }
      if (isOpen) out.push(...renderChildren(f._id, depth + 1))
    }

    for (const d of docsByFolder.get(parentKey) || []) {
      if (renaming && renaming.kind === 'file' && renaming.id === d._id) {
        out.push(
          <NameInput key={d._id} kind="file" depth={depth} initial={d.title} onSubmit={submitRename} onCancel={() => setRenaming(null)} />
        )
        continue
      }
      out.push(
        <div
          key={d._id}
          role="treeitem"
          tabIndex={0}
          className={`fx-row ${selected?.id === d._id ? 'selected' : ''} ${activeDocId === d._id ? 'active' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => startDrag(e, 'file', d._id)}
          onDragEnd={endDrag}
          onDragOver={(e) => allowDrop(e, d.folder || null)}
          onDrop={(e) => handleDrop(e, d.folder || null)}
          onClick={() => clickFile(d._id)}
          onContextMenu={(e) => openMenu(e, { kind: 'file', id: d._id })}
          onKeyDown={(e) => rowKeyDown(e, 'file', d._id)}
        >
          <span className="fx-chevron fx-chevron-space" />
          <span className="fx-icon fx-icon-file">
            <FileIcon />
          </span>
          <span className="fx-label" title={d.title}>
            {d.title}
          </span>
          <span className="fx-actions">
            <button
              type="button"
              title="Rename (F2)"
              onClick={(e) => {
                e.stopPropagation()
                setCreating(null)
                setRenaming({ kind: 'file', id: d._id })
              }}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                deleteItem('file', d._id)
              }}
            >
              <TrashIcon />
            </button>
          </span>
        </div>
      )
    }

    return out
  }

  const isEmpty = status === 'ready' && docs.length === 0 && folders.length === 0 && !creating

  return (
    <div className="file-explorer">
      <div className="fx-header">
        <span className="fx-title">Files</span>
        <div className="fx-header-actions">
          <button type="button" title="New File" onClick={() => startCreate('file')}>
            <NewFileIcon />
          </button>
          <button type="button" title="New Folder" onClick={() => startCreate('folder')}>
            <NewFolderIcon />
          </button>
          <button type="button" title="Refresh" onClick={load}>
            <RefreshIcon />
          </button>
          <button type="button" title="Collapse All Folders" onClick={() => setExpanded(new Set())}>
            <CollapseAllIcon />
          </button>
        </div>
      </div>

      <div
        className={`fx-list ${dropTarget === 'root' ? 'drop-target' : ''}`}
        role="tree"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null)
        }}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={(e) => allowDrop(e, null)}
        onDrop={(e) => handleDrop(e, null)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null)
        }}
      >
        {status === 'loading' && <p className="fx-empty">Loading files...</p>}

        {status === 'error' && (
          <div className="fx-empty">
            <p>Could not load your files.</p>
            <p className="fx-empty-small">{errorText}</p>
            <button type="button" className="fx-retry" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && renderChildren('root', 0)}

        {isEmpty && (
          <p className="fx-empty">
            No files yet.
            <br />
            Use the icons above to create a file or a folder.
          </p>
        )}
      </div>

      {notice && (
        <div className="fx-notice" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {menu && (
        <div
          className="fx-menu"
          style={{
            left: Math.max(4, Math.min(menu.x, window.innerWidth - 190)),
            top: Math.max(4, Math.min(menu.y, window.innerHeight - 170)),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(!menu.target || menu.target.kind === 'folder') && (
            <>
              <button type="button" onClick={() => startCreate('file', menu.target ? menu.target.id : null)}>
                New File
              </button>
              <button type="button" onClick={() => startCreate('folder', menu.target ? menu.target.id : null)}>
                New Folder
              </button>
            </>
          )}
          {menu.target && (
            <>
              {menu.target.kind === 'folder' && <div className="fx-menu-divider" />}
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  setCreating(null)
                  setRenaming(menu.target)
                }}
              >
                Rename <span className="fx-menu-key">F2</span>
              </button>
              <button type="button" className="danger" onClick={() => deleteItem(menu.target.kind, menu.target.id)}>
                Delete <span className="fx-menu-key">Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default FileExplorer