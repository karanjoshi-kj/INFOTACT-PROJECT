import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Signup.css'

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
const MIN_PASSWORD_LENGTH = 8

function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setIsLoading(true)

    // TODO: swap this for a real call once backend auth endpoint is ready
    // fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password }) })
    setTimeout(() => {
      setIsLoading(false)
      console.log('Signup attempt:', { name: trimmedName, email: trimmedEmail })
      navigate('/editor')
    }, 800)
  }

  return (
    <div className="signup-page">
      <div className="signup-glow-1"></div>
      <div className="signup-glow-2"></div>

      <div className="signup-card-wrapper">
        <div className="signup-corner-tab"></div>
        <form className="signup-card" onSubmit={handleSubmit} noValidate>
          <div className="signup-header-icon">SD</div>
          <h1 className="signup-title">Create Account</h1>
          <p className="signup-subtitle">Join SyncDoc and start collaborating</p>

          {error && (
            <div className="signup-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <div className="input-group">
            <label className="signup-label" htmlFor="name">Full Name</label>
            <div className="signup-input-wrapper">
              <input
                id="name"
                type="text"
                className="signup-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                disabled={isLoading}
                autoComplete="name"
                autoFocus
                required
                aria-invalid={!!error}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="signup-label" htmlFor="email">Email Address</label>
            <div className="signup-input-wrapper">
              <input
                id="email"
                type="email"
                className="signup-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                autoComplete="email"
                required
                aria-invalid={!!error}
              />
            </div>
          </div>

          <div className="input-row">
            <div className="input-group">
              <label className="signup-label" htmlFor="password">Password</label>
              <div className="signup-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="signup-input has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="signup-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="signup-label" htmlFor="confirmPassword">Confirm</label>
              <div className="signup-input-wrapper">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="signup-input has-toggle"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="signup-eye-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  disabled={isLoading}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>

          <button type="submit" className="signup-button" disabled={isLoading}>
            {isLoading ? <span className="spinner"></span> : 'Create Account'}
          </button>

          <p className="signup-footer">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default SignupPage