import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../services/api.js'
import './ForgotPassword.css'

const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
)

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    try {
      const data = await forgotPassword(trimmed)
      setSuccessMessage(data.message)
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
        <div className="forgot-header-icon"><MailIcon /></div>
        <h1 className="forgot-title">Forgot password?</h1>
        <p className="forgot-subtitle">
          Enter the email you registered with and we will send you a link to reset your password.
        </p>

        {error && <div className="forgot-error" role="alert">{error}</div>}

        {successMessage ? (
          <div className="forgot-success" role="status">
            {successMessage} The link expires in 15 minutes. Check your spam folder if it does not arrive.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="input-group">
              <label className="forgot-label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                className="forgot-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <button className="forgot-button" type="submit" disabled={loading}>
              {loading ? <span className="spinner" aria-label="Sending"></span> : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="forgot-footer">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage