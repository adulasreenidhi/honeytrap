import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Spinner from './components/Spinner.jsx'
import Toast from './components/Toast.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import useAuth from './context/useAuth.js'
import Login from './pages/Login.jsx'
import NotFound from './pages/NotFound.jsx'
import Portal from './pages/Portal.jsx'

const AdminHome = lazy(() => import('./pages/admin/AdminHome.jsx'))
const TrustMonitoring = lazy(() => import('./pages/admin/TrustMonitoring.jsx'))
const Alerts = lazy(() => import('./pages/admin/Alerts.jsx'))
const Incidents = lazy(() => import('./pages/admin/Incidents.jsx'))
const IncidentDetail = lazy(() => import('./pages/admin/IncidentDetail.jsx'))
const ActivityLog = lazy(() => import('./pages/admin/ActivityLog.jsx'))
const Users = lazy(() => import('./pages/admin/Users.jsx'))
const Devices = lazy(() => import('./pages/admin/Devices.jsx'))
const Decoys = lazy(() => import('./pages/admin/Decoys.jsx'))
const Policies = lazy(() => import('./pages/admin/Policies.jsx'))
const Reports = lazy(() => import('./pages/admin/Reports.jsx'))
const DemoMode = lazy(() => import('./pages/admin/DemoMode.jsx'))

function RoleRedirect() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'employee' ? '/portal' : '/admin'} replace />
}

function AppRoutes() {
  return (
    <>
      <Suspense fallback={<Spinner label="Loading workspace" className="min-h-screen" />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<RoleRedirect />} />
          </Route>
          <Route element={<ProtectedRoute roles={['employee']} />}>
            <Route path="/portal" element={<Portal />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin', 'analyst']} />}>
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/admin/trust" element={<TrustMonitoring />} />
            <Route path="/admin/alerts" element={<Alerts />} />
            <Route path="/admin/incidents" element={<Incidents />} />
            <Route path="/admin/incidents/:id" element={<IncidentDetail />} />
            <Route path="/admin/activity" element={<ActivityLog />} />
            <Route path="/admin/policies" element={<Policies />} />
            <Route path="/admin/reports" element={<Reports />} />
            <Route path="/admin/reports/:id" element={<Reports />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/devices" element={<Devices />} />
            <Route path="/admin/decoys" element={<Decoys />} />
            <Route path="/admin/demo" element={<DemoMode />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toast />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
