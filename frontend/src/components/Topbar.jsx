import { LogOut } from 'lucide-react'
import { useState } from 'react'
import useAuth from '../context/useAuth.js'
import { notify } from '../utils/notify.js'
import TrustGauge from './TrustGauge.jsx'

const statusStyles = {
  active: 'bg-allow/10 text-allow ring-allow/20',
  restricted: 'bg-warning/10 text-warning ring-warning/20',
  denied: 'bg-critical/10 text-red-300 ring-critical/20',
}

export default function Topbar() {
  const { user, session, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const status = String(session?.status || 'active').toLowerCase()

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      notify('Your local session was cleared, but the server could not confirm logout.', 'error')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-white/[0.06] bg-navy-950/85 px-4 py-3 sm:px-7 lg:px-9">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{user?.department || 'Company'} environment</p>
        <p className="mt-1 hidden text-xs text-slate-500 sm:block">Protected workspace · Continuous session monitoring</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <TrustGauge score={session?.trust_score ?? 0} />
        <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset sm:px-2.5 sm:text-[10px] ${statusStyles[status] || statusStyles.active}`}>
          {status}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
          <LogOut size={15} aria-hidden="true" />
          <span className="hidden sm:inline">{loggingOut ? 'Signing out…' : 'Logout'}</span>
        </button>
      </div>
    </header>
  )
}
