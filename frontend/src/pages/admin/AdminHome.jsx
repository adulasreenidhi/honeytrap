import { useEffect, useState } from 'react'
import { Activity, BellRing, Database, Shield, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardSummary, listAlerts, trustTrends, eventsOverTime } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import EventsChart from '../../components/EventsChart.jsx'
import Layout from '../../components/Layout.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatCard from '../../components/StatCard.jsx'
import TrustTrendChart from '../../components/TrustTrendChart.jsx'
import { notify } from '../../utils/notify.js'
import { formatTime } from '../../utils/format.js'

const severityColors = {
  low: '#64748b',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

function IncidentsBySeverity({ values = {} }) {
  const entries = Object.entries(values)
  return (
    <div className="space-y-3">
      {entries.map(([severity, count]) => {
        const total = Math.max(1, ...entries.map(([, value]) => Number(value) || 0))
        const width = Math.min(100, (Number(count) / total) * 100)
        return (
          <div className="grid grid-cols-[68px_1fr_34px] items-center gap-3" key={severity}>
            <span className="text-xs capitalize text-slate-400">{severity}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${width}%`, backgroundColor: severityColors[severity] || '#64748b' }} />
            </div>
            <span className="text-right font-mono text-xs text-slate-300">{count}</span>
          </div>
        )
      })}
      {!entries.length && <p className="py-8 text-center text-xs text-slate-500">No severity data available.</p>}
    </div>
  )
}

function LiveState({ updatedAt }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-500" aria-live="polite">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-allow opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-allow" />
      </span>
      <span className="font-semibold uppercase tracking-[0.12em] text-allow">Live</span>
      <span>Updated {updatedAt ? formatTime(updatedAt, true) : '—'}</span>
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
        <Link className="block font-medium text-slate-200 hover:text-blue-300" to={`/admin/incidents/${alert.incident_id}`}>
          <span>{alert.title}</span>
          <span className="mt-1 block max-w-lg text-[11px] leading-5 text-slate-500">{alert.message}</span>
        </Link>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (alert) => formatTime(alert.created_at, true),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">SECURITY OPERATIONS</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">SOC Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400">Live overview of monitored sessions, trust, and security indicators.</p>
          </div>
          <LiveState updatedAt={lastUpdated} />
        </section>

        {loading ? (
          <div className="surface"><Spinner label="Loading dashboard data" /></div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Active sessions" value={summary?.active_sessions ?? 0} icon={Activity} />
              <StatCard label="Monitored devices" value={summary?.monitored_devices ?? 0} icon={Shield} />
              <StatCard label="Decoy count" value={summary?.decoy_count ?? 0} icon={Database} />
              <StatCard label="Open alerts" value={summary?.open_alerts ?? 0} icon={BellRing} />
              <StatCard label="Average trust" value={`${Number(summary?.average_trust ?? 0).toFixed(1)}%`} icon={Timer} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="surface p-5 sm:p-6">
                <div className="mb-5">
                  <p className="eyebrow">INCIDENTS</p>
                  <h2 className="mt-1 text-sm font-semibold text-white">By severity</h2>
                </div>
                <IncidentsBySeverity values={summary?.incidents_by_severity} />
              </div>
              <div className="surface p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="eyebrow">CONTINUOUS TRUST</p>
                    <h2 className="mt-1 text-sm font-semibold text-white">Trust trend</h2>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-400" />Trust score</span>
                </div>
                <TrustTrendChart data={trust} />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="surface p-5 sm:p-6">
                <div className="mb-3">
                  <p className="eyebrow">MONITORING ACTIVITY</p>
                  <h2 className="mt-1 text-sm font-semibold text-white">Events over time</h2>
                </div>
                <EventsChart data={events} />
              </div>

              <div className="surface overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
                  <div>
                    <p className="eyebrow">LATEST SIGNALS</p>
                    <h2 className="mt-1 text-sm font-semibold text-white">Recent alerts</h2>
                  </div>
                  <Link className="text-xs font-medium text-blue-300 hover:text-blue-200" to="/admin/alerts">View all</Link>
                </div>
                <div className="mt-3">
                  <DataTable
                    columns={alertColumns}
                    emptyDescription="No alerts have been raised."
                    emptyTitle="All clear"
                    rows={alerts}
                    rowClassName={(alert) => alert.severity === 'critical' ? 'bg-critical/[0.035] shadow-[inset_3px_0_16px_rgba(239,68,68,0.12)]' : ''}
                  />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  )
}
