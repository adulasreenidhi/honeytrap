import { useEffect, useState } from 'react'
import { Activity, BellRing, Database, Shield, Timer, ArrowUpRight, ShieldAlert, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { dashboardSummary, listAlerts, trustTrends, eventsOverTime } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import Layout from '../../components/Layout.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatCard from '../../components/StatCard.jsx'
import TrustGauge from '../../components/TrustGauge.jsx'
import TrustTrendChart from '../../components/TrustTrendChart.jsx'
import { notify } from '../../utils/notify.js'
import { formatTime } from '../../utils/format.js'

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
}

function SeverityDonut({ values = {} }) {
  const entries = Object.entries(values).map(([name, value]) => ({
    name,
    value: Number(value) || 0,
  }))
  const total = entries.reduce((sum, item) => sum + item.value, 0)
  const activeEntries = entries.filter((e) => e.value > 0)
  const chartData = activeEntries.length ? activeEntries : [{ name: 'none', value: 1 }]

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={68}
              paddingAngle={total > 0 && activeEntries.length > 1 ? 4 : 0}
              dataKey="value"
              stroke="none"
            >
              {total > 0
                ? activeEntries.map((entry) => (
                    <Cell key={entry.name} fill={severityColors[entry.name] || '#64748b'} />
                  ))
                : <Cell fill="#2e2318" />
              }
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0]
                return (
                  <div className="rounded-xl border border-border bg-surface px-3 py-1.5 shadow-xl text-xs">
                    <span className="capitalize font-semibold" style={{ color: severityColors[item.name] || '#f5ede4' }}>{item.name}</span>
                    <span className="ml-2 font-mono font-bold text-text tabular-nums">{item.value}</span>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-text tabular-nums">{total}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Incidents</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 min-w-[140px]">
        {entries.map(({ name, value }) => (
          <div key={name} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: severityColors[name] || '#64748b' }} />
              <span className="capitalize text-muted font-medium">{name}</span>
            </div>
            <span className="font-mono font-semibold text-text tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemOnlinePill({ updatedAt }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-success/30 bg-success/10 px-3.5 py-1.5 text-xs shadow-sm" aria-live="polite">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span className="font-bold uppercase tracking-wider text-success text-[11px]">System Online</span>
      <span className="text-muted text-[10px] tabular-nums">· Updated {updatedAt ? formatTime(updatedAt, true) : '—'}</span>
    </div>
  )
}

export default function AdminHome() {
  const [summary, setSummary] = useState(null)
  const [trust, setTrust] = useState([])
  const [events, setEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const loading = summary === null && !loadFailed

  useEffect(() => {
    let active = true
    async function refreshDashboard() {
      try {
        const [nextSummary, nextTrust, nextEvents, nextAlerts] = await Promise.all([
          dashboardSummary(),
          trustTrends(),
          eventsOverTime(),
          listAlerts({ page: 1, page_size: 5 }),
        ])
        if (!active) return
        setSummary(nextSummary)
        setTrust(nextTrust)
        setEvents(nextEvents)
        setAlerts(nextAlerts.items)
        setLastUpdated(new Date())
        setLoadFailed(false)
      } catch (error) {
        if (!active) return
        setLoadFailed(true)
        notify(error.detail || error.error || 'Unable to refresh the SOC dashboard.', 'error')
      }
    }

    refreshDashboard()
    const timer = window.setInterval(refreshDashboard, 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const hasCriticalAlerts = alerts.some((a) => a.severity === 'critical')

  const alertColumns = [
    {
      key: 'severity',
      header: 'Severity',
      render: (alert) => <SeverityBadge value={alert.severity} />,
    },
    {
      key: 'title',
      header: 'Alert',
      render: (alert) => (
        <Link className="block font-medium text-text hover:text-brand-light transition-colors" to={`/admin/incidents/${alert.incident_id}`}>
          <span className="font-semibold">{alert.title}</span>
          <span className="mt-0.5 block max-w-sm truncate text-[11px] leading-5 text-muted">{alert.message}</span>
        </Link>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (alert) => <span className="tabular-nums text-faint text-[11px]">{formatTime(alert.created_at, true)}</span>,
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header with Title and System Online Pill */}
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">SECURITY OPERATIONS CENTER</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-muted">Monitor threats. Maintain trust. Ensure security.</p>
          </div>
          <SystemOnlinePill updatedAt={lastUpdated} />
        </section>

        {loading ? (
          <div className="card"><Spinner label="Loading dashboard data" /></div>
        ) : (
          <>
            {/* StatCards Row */}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Active sessions" value={summary?.active_sessions ?? 0} icon={Activity} />
              <StatCard label="Monitored devices" value={summary?.monitored_devices ?? 0} icon={Shield} />
              <StatCard label="Honeytokens" value={summary?.decoy_count ?? 0} icon={Database} />
              <StatCard label="Open alerts" value={summary?.open_alerts ?? 0} icon={BellRing} />
              <StatCard label="Average trust" value={`${Number(summary?.average_trust ?? 0).toFixed(1)}%`} icon={Timer} />
            </section>

            {/* Charts Row: Large System Activity Area Chart + Donut Chart */}
            <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="card p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="eyebrow">TELEMETRY & VOLUME</p>
                    <h2 className="mt-1 text-base font-bold text-text">System Activity</h2>
                    <p className="mt-0.5 text-xs text-muted">Recorded session events over time.</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-2 w-2 rounded-full bg-brand shadow-glow-sm" />Events
                  </span>
                </div>
                <TrustTrendChart data={events} height={250} />
              </div>

              <div className="card p-5 sm:p-6">
                <div className="mb-2">
                  <p className="eyebrow">SEVERITY BREAKDOWN</p>
                  <h2 className="mt-1 text-base font-bold text-text">Incidents by Severity</h2>
                  <p className="mt-0.5 text-xs text-muted">Distribution of threat indicators.</p>
                </div>
                <SeverityDonut values={summary?.incidents_by_severity} />
              </div>
            </section>

            {/* Bottom Row of Three Cards: Recent Activity, Security Alerts, Trust Monitor */}
            <section className="grid gap-4 xl:grid-cols-3">
              {/* Card 1: Recent Activity / Trust Trends */}
              <div className="card p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="eyebrow">CONTINUOUS TRUST</p>
                    <h2 className="mt-1 text-sm font-bold text-text">Trust Trends</h2>
                  </div>
                  <Link className="text-xs font-semibold text-brand hover:text-brand-light transition-colors" to="/admin/trust">
                    View
                  </Link>
                </div>
                <p className="text-xs text-muted mb-3">Recent trust evaluations across sessions.</p>
                <TrustTrendChart data={trust} height={160} />
              </div>

              {/* Card 2: Security Alerts (with critical glow if critical items exist) */}
              <div className={`card overflow-hidden transition-all duration-200 ${hasCriticalAlerts ? 'border-danger/40 shadow-[0_0_25px_rgba(239,68,68,0.2)] ring-1 ring-danger/30' : ''}`}>
                <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-5 py-4">
                  <div className="flex items-center gap-2">
                    {hasCriticalAlerts && <ShieldAlert size={16} className="text-danger animate-pulse" aria-hidden="true" />}
                    <div>
                      <p className="eyebrow">SIGNALS</p>
                      <h2 className="mt-0.5 text-sm font-bold text-text">Security Alerts</h2>
                    </div>
                  </div>
                  <Link className="text-xs font-semibold text-brand hover:text-brand-light transition-colors" to="/admin/alerts">
                    View all
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <DataTable
                    columns={alertColumns}
                    emptyDescription="No alerts have been raised."
                    emptyTitle="All clear"
                    rows={alerts}
                    rowClassName={(alert) => alert.severity === 'critical' ? 'bg-danger/[0.06] border-l-2 border-l-danger' : ''}
                  />
                </div>
              </div>

              {/* Card 3: Compact Trust Monitor with TrustGauge */}
              <div className="card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="eyebrow">SESSION HEALTH</p>
                      <h2 className="mt-1 text-sm font-bold text-text">Trust Monitor</h2>
                    </div>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/30">
                      <Sparkles size={15} aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Fleet-wide average confidence score.</p>
                  <div className="mt-6 flex flex-col items-center justify-center gap-3">
                    <TrustGauge score={summary?.average_trust ?? 0} />
                    <div className="text-center">
                      <p className="text-xs font-semibold text-text">
                        {Number(summary?.average_trust ?? 0) > 70
                          ? 'High Trust Network'
                          : Number(summary?.average_trust ?? 0) > 40
                            ? 'Moderate Risk State'
                            : 'Elevated Risk'}
                      </p>
                      <p className="text-[11px] text-faint mt-0.5">
                        {summary?.active_sessions ?? 0} active sessions currently monitored
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 border-t border-border pt-4">
                  <Link
                    to="/admin/trust"
                    className="btn-secondary button-secondary w-full text-xs flex items-center justify-center gap-1.5"
                  >
                    Open Trust Monitoring
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  )
}
