import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../../services/api.js'
import { saveSession } from '../../utils/auth.js'
import './AuthPage.css'

// Landing page after Google / GitHub login: /oauth/callback#token=...&remember=1
// Builds the same session a normal login creates, then opens the editor.
function OAuthCallback() {
  const navigate = useNavigate()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    const remember = params.get('remember') === '1'

    // Remove the token from the address bar / history right away.
    window.history.replaceState(null, '', window.location.pathname)

    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true })
      return
    }

    getCurrentUser(token)
      .then((data) => {
        if (!data?.user) throw new Error('No user returned.')
        saveSession({ token, user: data.user }, remember)
        navigate('/editor', { replace: true })
      })
      .catch(() => {
        navigate('/login?error=oauth_failed', { replace: true })
      })
  }, [navigate])

  return (
    <div className="auth-page">
      <div className="auth-glow-1"></div>
      <div className="auth-glow-2"></div>
      <div className="auth-frame" style={{ minHeight: 0, display: 'flex', justifyContent: 'center', padding: 40 }}>
        <span className="spinner" role="status" aria-label="Signing you in"></span>
      </div>
    </div>
  )
}

export default OAuthCallback