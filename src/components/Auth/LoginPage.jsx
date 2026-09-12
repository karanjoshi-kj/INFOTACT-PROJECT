import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Login.css' // Yahan tum apni CSS file ka naam de sakte ho (jaise Auth.css ya Login.css)

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
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
      console.log('Login attempt:', { email, password })
      navigate('/editor')
    }, 800)
  }

  return (
    <div className="login-page">
      {/* Background glowing effects */}
      <div className="login-glow-1"></div>
      <div className="login-glow-2"></div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-header-icon">SD</div>
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Log in to SyncDoc to continue</p>

        {error && <div className="login-error">{error}</div>}

        <div className="input-group">
          <label className="login-label" htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="input-group">
          <label className="login-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className="login-button" disabled={isLoading}>
          {isLoading ? <span className="spinner"></span> : 'Sign In'}
        </button>

        <p className="login-footer">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  )
}

export default LoginPage