import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowUpRight, Check, CircleCheck, Info, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listAlerts, patchAlert } from '../../api/client.js'
import EmptyState from '../../components/EmptyState.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

const initialFilters = { severity: '', status: '' }

const severityIcons = {
  critical: ShieldAlert,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
}

const severityBorderGlow = {
  critical: 'border-danger/40 bg-danger/[0.03] shadow-[0_0_20px_rgba(239,68,68,0.15)] ring-1 ring-danger/25',
  high: 'border-brand/40 bg-brand/[0.02] hover:border-brand/60',
  medium: 'border-warning/30 bg-warning/[0.01] hover:border-warning/50',
  low: 'border-border bg-surface/90 hover:border-border/80',
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await listAlerts({ ...filters, page, page_size: pageSize })
        if (!active) return
        setAlerts(data.items)
        setTotal(data.total)
      } catch (error) {
        if (active) notify(error.detail || error.error || 'Unable to load alerts.', 'error')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [filters, page, pageSize])

  function changeFilter(name, value) {
    setLoading(true)
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  async function updateStatus(alert, status) {
    setUpdatingId(alert.id)
    try {
      const updatedAlert = await patchAlert(alert.id, { status })
      setAlerts((current) => current.map((item) => item.id === alert.id ? updatedAlert : item))
      notify(`Alert marked ${status}.`, 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to update alert.', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">DETECTION & TELEMETRY</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Alerts</h1>
          <p className="mt-1 text-sm text-muted">Prioritized detections from session anomalies, risk spikes, and honeytoken hits.</p>
        </section>

        <section className="card p-4 sm:p-5">
          <FilterBar
            filters={[
              { name: 'severity', label: 'Severity', options: ['low', 'medium', 'high', 'critical'].map((value) => ({ value, label: value })) },
              { name: 'status', label: 'Status', options: ['open', 'acknowledged', 'resolved'].map((value) => ({ value, label: value })) },
            ]}
            onChange={changeFilter}
            onReset={() => { setLoading(true); setFilters(initialFilters); setPage(1) }}
            values={filters}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-text">Alert Queue</h2>
            <span className="text-xs text-muted tabular-nums">{total} total alerts</span>
          </div>

          {loading ? (
            <div className="card"><Spinner label="Loading alert records" /></div>
          ) : alerts.length === 0 ? (
            <div className="card">
              <EmptyState title="No alerts match" description="Try changing the active filters or check back later." />
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const Icon = severityIcons[alert.severity] || AlertCircle
                const isCritical = alert.severity === 'critical'
                const cardStyle = severityBorderGlow[alert.severity] || severityBorderGlow.low

                return (
                  <article
                    key={alert.id}
                    className={`card p-4 sm:p-5 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${cardStyle}`}
                  >
                    {/* Left: Severity Icon + Title + Description */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isCritical
                          ? 'border-danger/35 bg-danger/10 text-danger'
                          : alert.severity === 'high'
                            ? 'border-brand/35 bg-brand/10 text-brand'
                            : alert.severity === 'medium'
                              ? 'border-warning/35 bg-warning/10 text-warning'
                              : 'border-border bg-surface-2 text-muted'
                      }`}>
                        <Icon size={20} aria-hidden="true" className={isCritical ? 'animate-pulse' : ''} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/admin/incidents/${alert.incident_id}`}
                            className="text-sm sm:text-base font-bold text-text hover:text-brand-light transition-colors"
                          >
                            {alert.title}
                          </Link>
                          <span className="font-mono text-[11px] text-faint">#{alert.id}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted max-w-2xl">{alert.message}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-faint">
                          <span>Session: <strong className="font-mono text-muted">#{alert.session_id}</strong></span>
                          <span>·</span>
                          <span>Incident: <strong className="font-mono text-muted">#{alert.incident_id}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Severity chip, status chip, time, and action buttons */}
                    <div className="flex flex-wrap items-center md:flex-col md:items-end justify-between gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                      <div className="flex items-center gap-2">
                        <SeverityBadge value={alert.severity} />
                        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                          {alert.status}
                        </span>
                        <time className="text-[11px] text-faint tabular-nums ml-1">
                          {formatTime(alert.created_at, true)}
                        </time>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        {alert.status === 'open' && (
                          <button
                            aria-label={`Acknowledge alert ${alert.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-text hover:border-brand/40 hover:bg-elevated transition-colors disabled:opacity-40"
                            disabled={updatingId === alert.id}
                            onClick={() => updateStatus(alert, 'acknowledged')}
                            type="button"
                          >
                            <Check size={13} aria-hidden="true" />
                            Acknowledge
                          </button>
                        )}
                        {alert.status !== 'resolved' && (
                          <button
                            aria-label={`Resolve alert ${alert.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success hover:bg-success/20 transition-colors disabled:opacity-40"
                            disabled={updatingId === alert.id}
                            onClick={() => updateStatus(alert, 'resolved')}
                            type="button"
                          >
                            <CircleCheck size={13} aria-hidden="true" />
                            Resolve
                          </button>
                        )}
                        <Link
                          aria-label={`Open incident for alert ${alert.id}`}
                          className="btn-secondary button-secondary min-h-8 px-2.5 py-1 text-xs"
                          to={`/admin/incidents/${alert.incident_id}`}
                        >
                          Incident
                          <ArrowUpRight size={12} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          <div className="card overflow-hidden">
            <Pagination
              disabled={loading}
              onChange={(nextPage, nextPageSize) => { setLoading(true); setPage(nextPage); setPageSize(nextPageSize) }}
              page={page}
              pageSize={pageSize}
              total={total}
            />
          </div>
        </section>
      </div>
    </Layout>
  )
}
