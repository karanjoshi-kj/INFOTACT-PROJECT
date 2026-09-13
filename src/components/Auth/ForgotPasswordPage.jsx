import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ForgotPassword.css'

const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
)

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address.')
      return
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    setIsLoading(true)

    // TODO: swap this for a real call once backend auth endpoint is ready
    // fetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
    setTimeout(() => {
      setIsLoading(false)
      console.log('Password reset requested for:', email)
      setIsSubmitted(true)
    }, 800)
  }

  return (
    <div className="forgot-page">
      <div className="forgot-glow-1"></div>
      <div className="forgot-glow-2"></div>

      <div className="forgot-card">
        <div className="forgot-header-icon"><MailIcon /></div>
        <h1 className="forgot-title">Reset your password</h1>
        <p className="forgot-subtitle">
          Enter the email address linked to your account and we'll send you a link to reset your password.
        </p>

        {error && <div className="forgot-error">{error}</div>}

        {isSubmitted ? (
          <div className="forgot-success">
            If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox (and spam folder).
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="forgot-label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="forgot-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <button type="submit" className="forgot-button" disabled={isLoading}>
              {isLoading ? <span className="spinner"></span> : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="forgot-footer">
          Remembered your password? <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage