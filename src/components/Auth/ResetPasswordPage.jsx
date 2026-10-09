import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../../services/api.js'
import './ForgotPassword.css'

const MIN_PASSWORD_LENGTH = 8

const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Keep the token in memory, then remove it from the address bar.
  const [token] = useState(() => searchParams.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (token) navigate('/reset-password', { replace: true })
  }, [token, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await resetPassword({ token, password, confirmPassword })
      setPassword('')
      setConfirmPassword('')
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="forgot-page">
      <div className="forgot-glow-1"></div>
      <div className="forgot-glow-2"></div>

      <div className="forgot-card">
        <div className="forgot-header-icon"><LockIcon /></div>
        <h1 className="forgot-title">Reset password</h1>

        {done ? (
          <>
            <p className="forgot-subtitle">Your password has been changed.</p>
            <div className="forgot-success" role="status">
              Password reset successfully. You can now log in with your new password.
            </div>
            <p className="forgot-footer">
              <Link to="/login">Go to login</Link>
            </p>
          </>
        ) : !token ? (
          <>
            <p className="forgot-subtitle">This reset link is missing or has already been opened.</p>
            <div className="forgot-notice" role="alert">
              Please request a new password reset link.
            </div>
            <p className="forgot-footer">
              <Link to="/forgot-password">Request a new link</Link>
            </p>
          </>
        ) : (
          <>
            <p className="forgot-subtitle">
              Choose a new password (at least {MIN_PASSWORD_LENGTH} characters).
            </p>

            {error && <div className="forgot-error" role="alert">{error}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div className="input-group">
                <label className="forgot-label" htmlFor="reset-password">New password</label>
                <input
                  id="reset-password"
                  className="forgot-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>

              <div className="input-group">
                <label className="forgot-label" htmlFor="reset-confirm">Confirm password</label>
                <input
                  id="reset-confirm"
                  className="forgot-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>

              <button className="forgot-button" type="submit" disabled={loading}>
                {loading ? <span className="spinner" aria-label="Saving"></span> : 'Reset password'}
              </button>
            </form>

            <p className="forgot-footer">
              <Link to="/login">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ResetPasswordPage