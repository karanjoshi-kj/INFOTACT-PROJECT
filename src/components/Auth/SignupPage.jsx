import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Signup.css'

const UserIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const MailIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
)

const LockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

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
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setIsLoading(true)

    // TODO: swap this for a real call once backend auth endpoint is ready
    // fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) })
    setTimeout(() => {
      setIsLoading(false)
      console.log('Signup attempt:', { name, email, password })
      navigate('/editor')
    }, 800)
  }

  return (
    <div className="signup-page">
      <div className="signup-glow-1"></div>
      <div className="signup-glow-2"></div>

      {/* Floating neon / phantom-green boxes drifting behind the card */}
      <div className="signup-float-box fb-1"></div>
      <div className="signup-float-box fb-2"></div>
      <div className="signup-float-box fb-3"></div>
      <div className="signup-float-box fb-4"></div>
      <div className="signup-float-box fb-5"></div>
      <div className="signup-float-box fb-6"></div>
      <div className="signup-float-box fb-7"></div>
      <div className="signup-float-box fb-8"></div>

      <div className="signup-card-wrapper">
        <div className="signup-corner-tab"></div>
        <form className="signup-card" onSubmit={handleSubmit}>
          <div className="signup-header-icon">SD</div>
          <div className="signup-title-bar"></div>
          <h1 className="signup-title">Create Account</h1>
          <p className="signup-subtitle">Join SyncDoc and start collaborating</p>

          {error && <div className="signup-error">{error}</div>}

          <div className="input-group">
            <label className="signup-label" htmlFor="name">Full Name</label>
            <div className="signup-input-wrapper">
              <span className="signup-input-icon"><UserIcon /></span>
              <input
                id="name"
                type="text"
                className="signup-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          </div>

          <div className="input-group">
            <label className="signup-label" htmlFor="email">Email Address</label>
            <div className="signup-input-wrapper">
              <span className="signup-input-icon"><MailIcon /></span>
              <input
                id="email"
                type="email"
                className="signup-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="input-row">
            <div className="input-group">
              <label className="signup-label" htmlFor="password">Password</label>
              <div className="signup-input-wrapper">
                <span className="signup-input-icon"><LockIcon /></span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="signup-input has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="signup-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="signup-label" htmlFor="confirmPassword">Confirm</label>
              <div className="signup-input-wrapper">
                <span className="signup-input-icon"><LockIcon /></span>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="signup-input has-toggle"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="signup-eye-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>

          <button type="submit" className="signup-button" disabled={isLoading}>
            {isLoading ? <span className="spinner"></span> : 'Create Account'}
          </button>

          <div className="signup-footer-box">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SignupPage