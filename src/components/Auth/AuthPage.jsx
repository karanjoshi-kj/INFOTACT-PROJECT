import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { loginUser, signupUser } from '../../services/api.js'
import { saveSession } from '../../utils/auth.js'
import './AuthPage.css'

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

// initialMode: 'signin' | 'signup' — decides which side is active on first load.
function AuthPage({ initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode) // 'signin' | 'signup'
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/editor'

  // ---- Sign In state ----
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siRemember, setSiRemember] = useState(false)
  const [siError, setSiError] = useState('')
  const [siLoading, setSiLoading] = useState(false)
  const [siShowPassword, setSiShowPassword] = useState(false)

  // ---- Sign Up state ----
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [suError, setSuError] = useState('')
  const [suLoading, setSuLoading] = useState(false)
  const [suShowPassword, setSuShowPassword] = useState(false)
  const [suShowConfirm, setSuShowConfirm] = useState(false)

  const goToSignIn = (prefillEmail) => {
    setMode('signin')
    if (prefillEmail) setSiEmail(prefillEmail)
  }
  const goToSignUp = () => setMode('signup')

  const handleSignIn = async (e) => {
    e.preventDefault()
    if (siLoading) return

    const normalizedEmail = siEmail.trim().toLowerCase()

    if (!normalizedEmail || !siPassword) {
      setSiError('Please fill in all fields to continue.')
      return
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setSiError('Please enter a valid email address.')
      return
    }

    setSiError('')
    setSiLoading(true)

    try {
      const data = await loginUser({ email: normalizedEmail, password: siPassword })
      if (!data?.token) throw new Error('Login failed: the server did not return a token.')

      saveSession({ token: data.token, user: data.user }, siRemember)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setSiError(err.message)
      setSiLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (suLoading) return

    const trimmedName = suName.trim()
    const normalizedEmail = suEmail.trim().toLowerCase()

    if (!trimmedName || !normalizedEmail || !suPassword || !suConfirm) {
      setSuError('Please fill in all fields.')
      return
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setSuError('Please enter a valid email address.')
      return
    }
    if (suPassword.length < MIN_PASSWORD_LENGTH) {
      setSuError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (suPassword !== suConfirm) {
      setSuError('Passwords do not match.')
      return
    }

    setSuError('')
    setSuLoading(true)

    // Step 1: create the account
    try {
      await signupUser({ name: trimmedName, email: normalizedEmail, password: suPassword })
    } catch (err) {
      setSuError(err.message)
      setSuLoading(false)
      return
    }

    // Step 2: log in automatically (signup does not return a token)
    try {
      const data = await loginUser({ email: normalizedEmail, password: suPassword })
      if (!data?.token) throw new Error('No token returned.')

      saveSession({ token: data.token, user: data.user }, false)
      navigate('/editor', { replace: true })
    } catch {
      // Account exists, only the auto-login step failed — slide over to
      // Sign In with the email prefilled instead of a full route change.
      setSuLoading(false)
      goToSignIn(normalizedEmail)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-glow-1"></div>
      <div className="auth-glow-2"></div>

      <div className="auth-frame">
        <div className="auth-corner auth-corner-tl" aria-hidden="true"></div>
        <div className="auth-corner auth-corner-tr" aria-hidden="true"></div>
        <div className="auth-corner auth-corner-br" aria-hidden="true"></div>

        <div className={`auth-container ${mode === 'signup' ? 'right-panel-active' : ''}`}>
          {/* ===== Sign Up form ===== */}
          <div className={`form-container sign-up-container ${mode === 'signup' ? 'active-mobile' : ''}`}>
            <form className="auth-form" onSubmit={handleSignUp} noValidate>
              <div className="auth-brand">SyncDoc</div>
              <h1 className="auth-title">Create Account</h1>
              <p className="auth-subtitle">Join SyncDoc and start collaborating</p>

              {suError && (
                <div className="auth-error" role="alert" aria-live="polite">{suError}</div>
              )}

              <div className="auth-input-group">
                <input
                  type="text"
                  className="auth-input"
                  value={suName}
                  onChange={(e) => setSuName(e.target.value)}
                  placeholder="Full name"
                  disabled={suLoading}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="auth-input-group">
                <input
                  type="email"
                  className="auth-input"
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  placeholder="Email address"
                  disabled={suLoading}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-input-group">
                <div className="auth-input-wrapper">
                  <input
                    type={suShowPassword ? 'text' : 'password'}
                    className="auth-input has-toggle"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    placeholder="Password"
                    disabled={suLoading}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setSuShowPassword((v) => !v)}
                    aria-label={suShowPassword ? 'Hide password' : 'Show password'}
                    disabled={suLoading}
                  >
                    {suShowPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="auth-input-group">
                <div className="auth-input-wrapper">
                  <input
                    type={suShowConfirm ? 'text' : 'password'}
                    className="auth-input has-toggle"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    placeholder="Confirm password"
                    disabled={suLoading}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setSuShowConfirm((v) => !v)}
                    aria-label={suShowConfirm ? 'Hide password' : 'Show password'}
                    disabled={suLoading}
                  >
                    {suShowConfirm ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <button type="submit" className="auth-button" disabled={suLoading}>
                {suLoading ? <span className="spinner"></span> : 'Sign Up'}
              </button>

              {/* Mobile-only toggle link (overlay is hidden on small screens) */}
              <p className="auth-mobile-switch">
                Already have an account?{' '}
                <button type="button" className="auth-link-btn" onClick={() => goToSignIn()}>Sign In</button>
              </p>
            </form>
          </div>

          {/* ===== Sign In form ===== */}
          <div className={`form-container sign-in-container ${mode === 'signin' ? 'active-mobile' : ''}`}>
            <form className="auth-form" onSubmit={handleSignIn} noValidate>
              <div className="auth-brand">SyncDoc</div>
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-subtitle">Log in to SyncDoc to continue</p>

              {siError && (
                <div className="auth-error" role="alert" aria-live="polite">{siError}</div>
              )}

              <div className="auth-input-group">
                <input
                  type="email"
                  className="auth-input"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  placeholder="Email address"
                  disabled={siLoading}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-input-group">
                <div className="auth-input-wrapper">
                  <input
                    type={siShowPassword ? 'text' : 'password'}
                    className="auth-input has-toggle"
                    value={siPassword}
                    onChange={(e) => setSiPassword(e.target.value)}
                    placeholder="Password"
                    disabled={siLoading}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setSiShowPassword((v) => !v)}
                    aria-label={siShowPassword ? 'Hide password' : 'Show password'}
                    disabled={siLoading}
                  >
                    {siShowPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="auth-row-between">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={siRemember}
                    onChange={(e) => setSiRemember(e.target.checked)}
                    disabled={siLoading}
                  />
                  Remember me
                </label>
                <Link to="/forgot-password" className="auth-forgot-link">Forgot password?</Link>
              </div>

              <button type="submit" className="auth-button" disabled={siLoading}>
                {siLoading ? <span className="spinner"></span> : 'Sign In'}
              </button>

              <p className="auth-mobile-switch">
                Don't have an account?{' '}
                <button type="button" className="auth-link-btn" onClick={goToSignUp}>Sign Up</button>
              </p>
            </form>
          </div>

          {/* ===== Sliding overlay ===== */}
          <div className="overlay-container">
            <div className="overlay">
              <div className="overlay-panel overlay-left">
                <h2>Welcome Back!</h2>
                <p>Already have an account? Sign in to keep collaborating on your documents.</p>
                <button type="button" className="ghost-button" onClick={() => goToSignIn()}>Sign In</button>
              </div>
              <div className="overlay-panel overlay-right">
                <h2>Hello, Friend!</h2>
                <p>New to SyncDoc? Create an account and start collaborating in real time.</p>
                <button type="button" className="ghost-button" onClick={goToSignUp}>Sign Up</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthPage