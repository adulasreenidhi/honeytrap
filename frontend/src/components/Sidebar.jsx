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

  const linkClass = ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-accent/10 text-blue-300' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'}`

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.06] bg-navy-900/70 px-4 py-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25">
          <ShieldCheck size={21} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide text-white">HONEY<span className="text-accent">GATE</span></p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Continuous trust</p>
        </div>
      </div>

      <nav className="mt-8" aria-label="Primary navigation">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Workspace</p>
        {user?.role === 'employee' ? (
          <NavLink to="/portal" className={linkClass}>
            <Building2 size={17} aria-hidden="true" />
            Company Environment
          </NavLink>
        ) : (
          <div className="mt-3 space-y-1">
            {sections.map((section) => {
              const links = section.links.filter((link) => !link.roles || link.roles.includes(user?.role))
              return (
                <details className="admin-nav-group" key={section.label} open={wideScreen}>
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 hover:text-slate-400 lg:hidden">
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

      <div className="mt-5 border-t border-white/[0.06] pt-4 lg:mt-auto lg:pt-5">
        <div className="flex items-center gap-2.5 px-3">
          <span className="h-2 w-2 rounded-full bg-allow shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
          <span className="text-xs text-slate-500">Monitoring active</span>
        </div>
        <p className="mt-3 px-3 text-[10px] leading-4 text-slate-600">Prototype: all data and responses are simulated.</p>
      </div>
    </aside>
  )
}
