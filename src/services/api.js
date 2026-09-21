// All backend calls live here, so pages stay clean and the
// base URL / error handling is in one place.

const API_BASE = '/api' // forwarded to the Express server by the Vite proxy

async function request(path, { method = 'GET', body, token } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
    throw new Error(data?.message || `Request failed (status ${response.status}).`)
  }

  return data
}

export function signupUser({ name, email, password }) {
  return request('/auth/signup', { method: 'POST', body: { name, email, password } })
}

export function loginUser({ email, password }) {
  return request('/auth/login', { method: 'POST', body: { email, password } })
}