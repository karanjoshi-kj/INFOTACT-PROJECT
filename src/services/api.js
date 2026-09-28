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

// Send only the fields you want to change: { html }, { title }, { folder } or any mix.
// folder: a folder id to move the document into, or null for the top level.
export function saveDocument(id, { html, title, folder }, { keepalive = false } = {}) {
  const body = {}
  if (html !== undefined) body.html = html
  if (title !== undefined) body.title = title
  if (folder !== undefined) body.folder = folder
  return request(`/documents/${id}`, { method: 'PUT', body, keepalive })
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