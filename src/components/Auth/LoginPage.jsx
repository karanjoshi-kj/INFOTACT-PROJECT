import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Auth.css'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in both fields.')
      return
    }
    // TODO: swap this for a real call once backend auth endpoint is ready
    // fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    console.log('Login attempt:', { email, password })
    navigate('/editor')
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">SyncDoc</h1>
        <p className="auth-subtitle">Log in to continue</p>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="auth-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="auth-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <button type="submit" className="auth-button">Log In</button>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  )
}

export default LoginPage