import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './components/Auth/LoginPage.jsx'
import SignupPage from './components/Auth/SignupPage.jsx'
import ForgotPasswordPage from './components/Auth/ForgotPasswordPage.jsx'
import EditorPage from './pages/EditorPage.jsx'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/editor" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App