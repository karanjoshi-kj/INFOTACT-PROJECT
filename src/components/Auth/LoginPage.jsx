import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { loginUser } from '../../services/api.js'
import { saveSession } from '../../utils/auth.js'
import './Login.css'

const EyeIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // If the user was sent here from a protected page, go back there after login
  const redirectTo = location.state?.from?.pathname || '/editor'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLoading) return

    // The backend does not lowercase emails, so we normalise here
    // (signup does the same, so the two always match).
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password) {
      setError('Please fill in all fields to continue.')
      return
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const data = await loginUser({ email: normalizedEmail, password })

      if (!data?.token) {
        throw new Error('Login failed: the server did not return a token.')
      }

      saveSession({ token: data.token, user: data.user }, rememberMe)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow-1"></div>
      <div className="login-glow-2"></div>

      <div className="login-card-wrapper">
        <div className="login-corner-tab"></div>
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-brand">SyncDoc</div>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Log in to SyncDoc to continue</p>

          {error && (
            <div className="login-error" id="login-error-msg" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <div className="input-group">
            <label className="login-label" htmlFor="email">Email Address</label>
            <div className="login-input-wrapper">
              <input
                id="email"
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                autoComplete="email"
                autoFocus
                required
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error-msg' : undefined}
              />
            </div>
          </div>

          <div className="input-group">
            <div className="login-label-row">
              <label className="login-label" htmlFor="password">Password</label>
              <Link to="/forgot-password" className="login-forgot-link">Forgot password?</Link>
            </div>
            <div className="login-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="login-input has-toggle"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
                required
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error-msg' : undefined}
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="login-remember-row">
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              autoComplete="off"
            />
            <label htmlFor="remember">Remember me on this device</label>
          </div>

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? <span className="spinner"></span> : 'Sign In'}
          </button>

          <p className="login-footer">
            Don't have an account? <Link to="/signup">Sign up</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default LoginPage