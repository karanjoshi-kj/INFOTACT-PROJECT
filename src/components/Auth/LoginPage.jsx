import AuthPage from './AuthPage.jsx'
import './PaperCutBackground.css'
import './LoginChains.css'

function LoginPage() {
  return (
    <div className="login-route">
      <AuthPage initialMode="signin" />
    </div>
  )
}

export default LoginPage