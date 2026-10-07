// All backend calls live here, so pages stay clean and the
// base URL / error handling is in one place.
import { getToken } from '../utils/auth.js'

const API_BASE = '/api' // forwarded to the Express server by the Vite proxy

async function request(path, { method = 'GET', body, token, keepalive = false } = {}) {
  // Use the given token, otherwise the logged-in user's token (if any)
  const authToken = token || getToken()

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      keepalive, // lets a save finish even while the tab is closing
    })
  } catch {
    throw new Error('Cannot reach the server. Please check that the backend is running.')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Response was not JSON (e.g. proxy error). Handled below.
  }

  if (!response.ok || (data && data.success === false)) {
    const error = new Error(data?.message || `Request failed (status ${response.status}).`)
    error.status = response.status // lets callers react to 401 / 404
    throw error
  }

  return data
}

export function signupUser({ name, email, password }) {
  return request('/auth/signup', { method: 'POST', body: { name, email, password } })
}

export function loginUser({ email, password }) {
  return request('/auth/login', { method: 'POST', body: { email, password } })
}

// Used after a Google / GitHub login: -> { user }
export function getCurrentUser(token) {
  return request('/auth/me', { token })
}

// ---- documents ----

// Every document owned by the logged-in user (light fields only, no html)
export function listDocuments() {
  return request('/documents')
}

export function createDocument(title = 'Untitled Document', folder = null) {
  return request('/documents', { method: 'POST', body: { title, folder } })
}

// -> { document, html }
export function getDocument(id) {
  return request(`/documents/${id}`)
}

// Send only the fields you want to change: { html }, { title }, { folder }, { toolState }, { roomCode } or any mix.
// folder: a folder id to move the document into, or null for the top level.
// roomCode: the live room this document is linked to (the server uses it for the "!" offline marks).
export function saveDocument(id, { html, title, folder, toolState, roomCode }, { keepalive = false } = {}) {
  const body = {}
  if (html !== undefined) body.html = html
  if (title !== undefined) body.title = title
  if (folder !== undefined) body.folder = folder
  if (toolState !== undefined) body.toolState = toolState
  if (roomCode !== undefined) body.roomCode = roomCode
  return request(`/documents/${id}`, { method: 'PUT', body, keepalive })
}

// Documents that were changed by someone else while you were offline -> { documents: [{ id, roomCode, ... }] }
export function listOfflineChanges() {
  return request('/documents/offline-changes')
}

// Tell the server this document now has the latest room content (clears its "!" mark)
export function ackDocumentSynced(id) {
  return request(`/documents/${id}/synced`, { method: 'POST' })
}

// Documents that have a room you created or joined ("Collab Files") -> { collabDocuments: [{ id, title, room, role }] }
export function listCollabDocuments() {
  return request('/collab')
}

// A room was created / joined for this document: it becomes a collaborative document (role: 'host' | 'collab')
export function markDocumentCollab(id, { roomCode, role }) {
  return request(`/collab/${id}`, { method: 'PUT', body: { roomCode, role } })
}

// The document is a normal single-user document again (you left the room)
export function unmarkDocumentCollab(id) {
  return request(`/collab/${id}`, { method: 'DELETE' })
}

// Room membership and approval requests use the logged-in user's JWT.
export function requestRoomMembership(roomCode) {
  return request('/rooms/join', { method: 'POST', body: { roomCode } })
}

export function listRoomJoinRequests(roomCode) {
  return request(`/rooms/${encodeURIComponent(roomCode)}/requests`)
}

export function updateRoomMemberStatus(roomCode, userId, status) {
  return request(
    `/rooms/${encodeURIComponent(roomCode)}/members/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: { status } }
  )
}

export async function exportDocumentPdf(id, { html, title, toolState } = {}) {
  const authToken = getToken()
  let response
  try {
    response = await fetch(`${API_BASE}/documents/${id}/export/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ html, title, toolState }),
    })
  } catch {
    throw new Error('Cannot reach the server for PDF export. Please check that the backend is running.')
  }

  if (!response.ok) {
    let msg = `PDF Export failed (status ${response.status}).`
    try {
      const data = await response.json()
      if (data && data.message) msg = data.message
    } catch {
      // not json
    }
    const err = new Error(msg)
    err.status = response.status
    throw err
  }

  const blob = await response.blob()
  return {
    blob,
    exportedAt: response.headers.get('X-SyncDoc-Exported-At'),
    exportCount: response.headers.get('X-SyncDoc-Export-Count'),
  }
}

export function deleteDocument(id) {
  return request(`/documents/${id}`, { method: 'DELETE' })
}

// ---- folders ----

export function listFolders() {
  return request('/folders')
}

export function createFolder(name = 'New Folder', parent = null) {
  return request('/folders', { method: 'POST', body: { name, parent } })
}

// Send only what changes: { name }, { parent } (id or null) or both.
export function updateFolder(id, { name, parent }) {
  const body = {}
  if (name !== undefined) body.name = name
  if (parent !== undefined) body.parent = parent
  return request(`/folders/${id}`, { method: 'PUT', body })
}

// Deletes the folder and everything inside it.
// -> { deletedFolderIds, deletedDocumentIds }
export function deleteFolder(id) {
  return request(`/folders/${id}`, { method: 'DELETE' })
}
