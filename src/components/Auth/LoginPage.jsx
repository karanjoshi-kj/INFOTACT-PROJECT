import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields to continue.')
      return
    }
    setError('')
    setIsLoading(true)

    // Simulate network request
    setTimeout(() => {
      setIsLoading(false)
      console.log('Login attempt:', { email, password, rememberMe })
      navigate('/editor')
    }, 800)
  }

  return (
    <div className="login-page">
      <div className="login-glow-1"></div>
      <div className="login-glow-2"></div>

      {/* Floating indigo/blue boxes drifting behind the card */}
      <div className="login-float-box lb-1"></div>
      <div className="login-float-box lb-2"></div>
      <div className="login-float-box lb-3"></div>
      <div className="login-float-box lb-4"></div>
      <div className="login-float-box lb-5"></div>
      <div className="login-float-box lb-6"></div>
      <div className="login-float-box lb-7"></div>
      <div className="login-float-box lb-8"></div>

      <div className="login-card-wrapper">
        <div className="login-corner-tab"></div>
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-header-icon">SD</div>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Log in to SyncDoc to continue</p>

          {error && <div className="login-error">{error}</div>}

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

          {/* Remember Me Checkbox */}
          <div className="login-remember-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '13px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              id="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <label htmlFor="remember" style={{ cursor: 'pointer' }}>Remember me for 30 days</label>
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