import { Link } from 'react-router-dom'
import './ForgotPassword.css'

const MailIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </svg>
)

// Password reset is not available in this build: the backend has no reset
// endpoint and no email delivery is configured. This page therefore sends
// nothing and collects no email address.
function ForgotPasswordPage() {
  return (
    <div className="forgot-page">
      <div className="forgot-glow-1"></div>
      <div className="forgot-glow-2"></div>

      <div className="forgot-card">
        <div className="forgot-header-icon"><MailIcon /></div>
        <h1 className="forgot-title">Password reset unavailable</h1>
        <p className="forgot-subtitle">
          Self-service password reset is not available in this version of SyncDoc.
        </p>

        <div className="forgot-notice" role="status">
          No reset email can be sent. If your account was created with Google or
          GitHub, use that sign-in option; otherwise contact the project owner.
        </div>

        <p className="forgot-footer">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage