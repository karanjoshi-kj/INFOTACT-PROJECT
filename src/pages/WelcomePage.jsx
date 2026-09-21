import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './WelcomePage.css'

function WelcomePage() {
  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)

  const handleGetStarted = () => {
    setIsLeaving(true)
    // wait for the fade/slide-out animation to finish before switching routes
    setTimeout(() => {
      navigate('/login')
    }, 500)
  }

  return (
    <div className={`welcome-page ${isLeaving ? 'welcome-fade-out' : 'welcome-fade-in'}`}>
      <div className="welcome-glow-1"></div>
      <div className="welcome-glow-2"></div>

      <div className="welcome-content">
        <p className="welcome-eyebrow">— Welcome to —</p>
        <h1 className="welcome-title">SYNCDOC</h1>
        <p className="welcome-subtitle">
          Real-time collaborative editing, reimagined.
        </p>

        <button className="welcome-button" onClick={handleGetStarted}>
          Get Started
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      <div className="welcome-mountains">
        <svg
          className="welcome-mountain-layer welcome-mountain-back"
          viewBox="0 0 1600 400"
          preserveAspectRatio="none"
        >
          <polygon points="0,400 0,250 200,120 420,260 650,90 900,240 1150,140 1350,270 1600,180 1600,400" />
        </svg>
        <svg
          className="welcome-mountain-layer welcome-mountain-mid"
          viewBox="0 0 1600 400"
          preserveAspectRatio="none"
        >
          <polygon points="0,400 0,300 250,180 500,320 780,160 1020,300 1300,190 1600,320 1600,400" />
        </svg>
        <svg
          className="welcome-mountain-layer welcome-mountain-front"
          viewBox="0 0 1600 400"
          preserveAspectRatio="none"
        >
          <polygon points="0,400 0,340 300,260 600,360 900,240 1200,350 1600,270 1600,400" />
        </svg>
      </div>
    </div>
  )
}

export default WelcomePage