import { Navigate, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../../utils/auth.js'

// Only logged-in users may see these pages (e.g. /editor).
export function ProtectedRoute({ children }) {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}

// Only logged-out users may see these pages (login, signup, forgot password).
export function PublicOnlyRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/editor" replace />
  }
  return children
}