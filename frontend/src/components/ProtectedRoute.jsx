import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Spinner from './Spinner.jsx'
import useAuth from '../context/useAuth.js'

export default function ProtectedRoute({ roles }) {
  const { user, token, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <Spinner label="Restoring secure session" className="min-h-screen" />
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'employee' ? '/portal' : '/admin'} replace />
  }
  return <Outlet />
}
