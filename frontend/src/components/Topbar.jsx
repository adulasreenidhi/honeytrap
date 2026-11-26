import { Bell, LogOut, Search, User } from 'lucide-react'
import { useState } from 'react'
import useAuth from '../context/useAuth.js'
import { notify } from '../utils/notify.js'
import TrustGauge from './TrustGauge.jsx'

const statusStyles = {
  active: 'bg-success/10 text-success border-success/30',
  restricted: 'bg-warning/10 text-warning border-warning/30',
  denied: 'bg-danger/10 text-danger border-danger/30',
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
    <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-7 lg:px-9">
      {/* Title / Context & Search */}
      <div className="flex items-center gap-6 min-w-0">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{user?.department || 'Company'} environment</p>
          <p className="mt-0.5 hidden text-xs text-muted sm:block">Protected workspace · Continuous session monitoring</p>
        </div>

        {/* Visual-only search input */}
        <div className="relative hidden xl:block w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="text"
            readOnly
            placeholder="Search resources, users, devices…"
            className="w-full rounded-xl border border-border bg-surface-2/60 py-1.5 pl-9 pr-3 text-xs text-text placeholder:text-faint focus:outline-none focus:border-brand/40"
            aria-label="Search resources (mock)"
          />
        </div>
      </div>

      {/* Right actions: Bell, TrustGauge, Status chip, Profile chip, Logout */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Visual bell icon */}
        <div
          className="relative hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2/50 text-muted hover:text-text hover:border-brand/30 transition-colors"
          title="Notifications"
        >
          <Bell size={16} aria-hidden="true" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand shadow-glow-sm" />
        </div>

        <TrustGauge score={session?.trust_score ?? 0} />

        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[10px] ${statusStyles[status] || statusStyles.active}`}>
          {status}
        </span>

        {/* Profile Chip */}
        {user && (
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-1.5 text-xs">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/25 font-semibold text-[11px] uppercase">
              {user.username ? user.username.charAt(0) : <User size={12} />}
            </div>
            <div className="text-left leading-tight">
              <p className="font-medium text-text max-w-[100px] truncate">{user.username}</p>
              <p className="text-[10px] font-semibold uppercase text-brand tracking-wider">{user.role}</p>
            </div>
          </div>
        )}

        {/* Logout button */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2/70 px-3 py-2 text-xs font-medium text-muted hover:border-brand/40 hover:bg-elevated hover:text-text disabled:opacity-50 transition-colors"
        >
          <LogOut size={15} aria-hidden="true" />
          <span className="hidden sm:inline">{loggingOut ? 'Signing out…' : 'Logout'}</span>
        </button>
      </div>
    </header>
  )
}
