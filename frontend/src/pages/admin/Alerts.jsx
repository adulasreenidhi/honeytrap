import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listAlerts, patchAlert } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

const initialFilters = { severity: '', status: '' }

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

  const columns = [
    { key: 'severity', header: 'Severity', render: (alert) => <SeverityBadge value={alert.severity} /> },
    {
      key: 'title',
      header: 'Alert',
      render: (alert) => (
        <div className="max-w-xl">
          <Link className="font-medium text-slate-200 hover:text-blue-300" to={`/admin/incidents/${alert.incident_id}`}>{alert.title}</Link>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{alert.message}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (alert) => <span className="capitalize text-slate-400">{alert.status}</span> },
    { key: 'session_id', header: 'Session', render: (alert) => <span className="font-mono text-slate-400">#{alert.session_id}</span> },
    { key: 'created_at', header: 'Created', render: (alert) => formatTime(alert.created_at, true) },
    {
      key: 'actions',
      header: 'Actions',
      render: (alert) => (
        <div className="flex items-center gap-2">
          {alert.status === 'open' && (
            <button
              aria-label={`Acknowledge alert ${alert.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/[0.05] disabled:opacity-40"
              disabled={updatingId === alert.id}
              onClick={() => updateStatus(alert, 'acknowledged')}
              type="button"
            >
              <Check size={12} aria-hidden="true" />Acknowledge
            </button>
          )}
          {alert.status !== 'resolved' && (
            <button
              aria-label={`Resolve alert ${alert.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-allow/20 px-2 py-1.5 text-[10px] text-allow hover:bg-allow/5 disabled:opacity-40"
              disabled={updatingId === alert.id}
              onClick={() => updateStatus(alert, 'resolved')}
              type="button"
            >
              <CircleCheck size={12} aria-hidden="true" />Resolve
            </button>
          )}
          <Link aria-label={`View incident ${alert.incident_id}`} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.05] hover:text-blue-300" to={`/admin/incidents/${alert.incident_id}`}>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">MONITORING</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Alerts</h1>
          <p className="mt-2 text-sm text-slate-400">Review and acknowledge monitored security indicators.</p>
        </section>
        <section className="surface p-4 sm:p-5">
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
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Alert queue</h2>
            <span className="text-xs text-slate-500">{total} total</span>
          </div>
          <DataTable
            columns={columns}
            emptyDescription="Try changing the active filters."
            emptyTitle="No alerts match"
            loading={loading}
            rows={alerts}
            rowClassName={(alert) => alert.severity === 'critical' ? 'bg-critical/[0.035] shadow-[inset_3px_0_16px_rgba(239,68,68,0.12)]' : ''}
          />
          <Pagination
            disabled={loading}
            onChange={(nextPage, nextPageSize) => { setLoading(true); setPage(nextPage); setPageSize(nextPageSize) }}
            page={page}
            pageSize={pageSize}
            total={total}
          />
        </section>
      </div>
    </Layout>
  )
}
