// Handles storing, reading and clearing the login session (JWT + user info).
// "Remember me" ON  -> localStorage   (survives closing the browser)
// "Remember me" OFF -> sessionStorage (cleared when the tab/browser closes)

const TOKEN_KEY = 'syncdoc-token'
const USER_KEY = 'syncdoc-user'

function readFromStorages(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveSession({ token, user }, remember = false) {
  clearSession()
  try {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(TOKEN_KEY, token)
    storage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Storage can be blocked (private mode etc.). The user just won't stay logged in.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // ignore
  }
}

export function getToken() {
  return readFromStorages(TOKEN_KEY)
}

export function getUser() {
  const raw = readFromStorages(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Reads the "exp" (expiry) time inside the JWT so we can log the user out
// on the frontend as soon as the token has expired.
function isTokenExpired(token) {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const { exp } = JSON.parse(json)
    if (!exp) return false
    return Date.now() >= exp * 1000
  } catch {
    return true
  }
}

export function isAuthenticated() {
  const token = getToken()
  if (!token) return false
  if (isTokenExpired(token)) {
    clearSession()
    return false
  }
  return true
}