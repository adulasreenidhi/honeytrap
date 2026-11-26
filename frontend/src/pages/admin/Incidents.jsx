import { useEffect, useState } from 'react'
import { ArrowRight, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listIncidents } from '../../api/client.js'
import EmptyState from '../../components/EmptyState.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

const initialFilters = { severity: '', status: '' }

export default function Incidents() {
  const [incidents, setIncidents] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await listIncidents({ ...filters, page, page_size: pageSize })
        if (!active) return
        setIncidents(data.items)
        setTotal(data.total)
      } catch (error) {
        if (active) notify(error.detail || error.error || 'Unable to load incidents.', 'error')
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

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">INVESTIGATION WORKFLOW</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Incidents</h1>
          <p className="mt-1 text-sm text-muted">Active threat investigations, forensic timeline evidence, and mitigation actions.</p>
        </section>

        <section className="card p-4 sm:p-5">
          <FilterBar
            filters={[
              { name: 'severity', label: 'Severity', options: ['low', 'medium', 'high', 'critical'].map((value) => ({ value, label: value })) },
              { name: 'status', label: 'Status', options: ['open', 'investigating', 'resolved'].map((value) => ({ value, label: value })) },
            ]}
            onChange={changeFilter}
            onReset={() => { setLoading(true); setFilters(initialFilters); setPage(1) }}
            values={filters}
          />
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-5 py-4">
            <div className="flex items-center gap-2">
              <Siren size={17} className="text-brand" aria-hidden="true" />
              <h2 className="text-sm font-bold text-text">Incident Queue</h2>
            </div>
            <span className="text-xs text-muted tabular-nums">{total} total incidents</span>
          </div>

          {loading ? (
            <Spinner label="Loading incident records" />
          ) : incidents.length === 0 ? (
            <EmptyState title="No incidents match" description="Try changing the active filters or check back later." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/40 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint bg-surface-2/20">
                    <th className="px-5 py-3">Incident ID</th>
                    <th className="px-4 py-3">Title & Summary</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Session</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {incidents.map((incident) => {
                    const isCritical = incident.severity === 'critical'
                    return (
                      <tr
                        key={incident.id}
                        className={`transition-colors hover:bg-surface-2/70 ${isCritical ? 'bg-danger/[0.04]' : ''}`}
                      >
                        <td className="px-5 py-3.5 font-mono text-xs font-bold text-text">
                          #{incident.id}
                        </td>
                        <td className="px-4 py-3.5">
                          <Link
                            to={`/admin/incidents/${incident.id}`}
                            className="font-bold text-xs sm:text-sm text-text hover:text-brand-light transition-colors block"
                          >
                            {incident.title}
                          </Link>
                          <p className="mt-0.5 max-w-lg text-[11px] text-muted truncate">
                            {incident.summary || 'An indicator of compromise requiring investigation.'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <SeverityBadge value={incident.severity} />
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            incident.status === 'open'
                              ? 'border-danger/30 bg-danger/10 text-danger'
                              : incident.status === 'investigating'
                                ? 'border-warning/30 bg-warning/10 text-warning'
                                : 'border-success/30 bg-success/10 text-success'
                          }`}>
                            {incident.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted">
                          #{incident.session_id}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-faint tabular-nums">
                          {formatTime(incident.created_at, true)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            className="btn-secondary button-secondary min-h-8 px-3 py-1 text-xs"
                            to={`/admin/incidents/${incident.id}`}
                          >
                            Review
                            <ArrowRight size={12} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

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
