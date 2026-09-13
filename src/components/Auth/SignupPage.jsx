import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Signup.css'

function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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
      {/* Background glowing effects */}
      <div className="signup-glow-1"></div>
      <div className="signup-glow-2"></div>

      <form className="signup-card" onSubmit={handleSubmit}>
        <div className="signup-header-icon">SD</div>
        <h1 className="signup-title">Create your account</h1>
        <p className="signup-subtitle">Join SyncDoc and start collaborating</p>

        {error && <div className="signup-error">{error}</div>}

        <div className="input-group">
          <label className="signup-label" htmlFor="name">Full Name</label>
          <input
            id="name"
            type="text"
            className="signup-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div className="input-group">
          <label className="signup-label" htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            className="signup-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="input-row">
          <div className="input-group">
            <label className="signup-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="signup-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="input-group">
            <label className="signup-label" htmlFor="confirmPassword">Confirm</label>
            <input
              id="confirmPassword"
              type="password"
              className="signup-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
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
  )
}

export default SignupPage