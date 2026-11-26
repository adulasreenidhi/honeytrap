import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  Building2,
  ChartNoAxesCombined,
  FileBarChart,
  FlaskConical,
  Laptop,
  Settings2,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import useAuth from '../context/useAuth.js'
import BrandLogo from './BrandLogo.jsx'

export default function Sidebar() {
  const { user } = useAuth()
  const [wideScreen, setWideScreen] = useState(() => window.matchMedia('(min-width: 1024px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setWideScreen(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const sections = [
    {
      label: 'Monitor',
      links: [
        { to: '/admin', label: 'SOC Dashboard', icon: ChartNoAxesCombined, end: true },
        { to: '/admin/trust', label: 'Trust monitoring', icon: ShieldCheck },
      ],
    },
    {
      label: 'Investigate',
      links: [
        { to: '/admin/alerts', label: 'Alerts', icon: Bell },
        { to: '/admin/incidents', label: 'Incidents', icon: Siren },
        { to: '/admin/activity', label: 'Activity log', icon: Activity },
        { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
      ],
    },
    {
      label: 'Manage',
      links: [
        { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
        { to: '/admin/devices', label: 'Devices', icon: Laptop, roles: ['admin'] },
        { to: '/admin/decoys', label: 'Decoys', icon: ShieldCheck, roles: ['admin'] },
        { to: '/admin/policies', label: 'Policies', icon: Settings2 },
      ],
    },
    {
      label: 'Demo',
      links: [{ to: '/admin/demo', label: 'Demo mode', icon: FlaskConical, roles: ['admin'] }],
    },
  ]

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-gradient-to-r from-brand-light to-brand-dark text-white font-semibold shadow-glow-sm'
        : 'text-muted hover:bg-surface-2 hover:text-text'
    }`

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface/95 px-4 py-4 backdrop-blur-md lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between">
        <BrandLogo size="md" tagline="Continuous trust" />
      </div>

      <nav className="mt-8 flex-1" aria-label="Primary navigation">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Workspace</p>
        {user?.role === 'employee' ? (
          <div className="mt-2 space-y-1">
            <NavLink to="/portal" className={linkClass}>
              <Building2 size={17} aria-hidden="true" />
              Company Environment
            </NavLink>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {sections.map((section) => {
              const links = section.links.filter((link) => !link.roles || link.roles.includes(user?.role))
              return (
                <details className="admin-nav-group" key={section.label} open={wideScreen}>
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint hover:text-muted lg:hidden">
                    {section.label}
                    <span aria-hidden="true">⌄</span>
                  </summary>
                  <div className="admin-nav-links space-y-1">
                    {links.map(({ to, label, icon: Icon, end }) => (
                      <NavLink end={end || to === '/admin/incidents' || to === '/admin/reports'} key={to} to={to} className={linkClass}>
                        <Icon size={16} aria-hidden="true" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </nav>

      <div className="mt-6 border-t border-border pt-4 lg:mt-auto">
        <div className="rounded-xl border border-border/80 bg-surface-2/60 p-3 shadow-inner">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/30">
              <ShieldCheck size={16} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold text-text">Secure. Detect. Trust.</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                <span className="text-[10px] text-muted">Monitoring active</span>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 px-2 text-[10px] leading-4 text-faint">Prototype: all data and responses are simulated.</p>
      </div>
    </aside>
  )
}
