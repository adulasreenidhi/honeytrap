import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listIncidents } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
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

  const columns = [
    { key: 'severity', header: 'Severity', render: (incident) => <SeverityBadge value={incident.severity} /> },
    {
      key: 'title',
      header: 'Incident',
      render: (incident) => (
        <div className="max-w-xl">
          <Link className="font-medium text-slate-200 hover:text-blue-300" to={`/admin/incidents/${incident.id}`}>{incident.title}</Link>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">An indicator of compromise requiring investigation.</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (incident) => <span className="capitalize text-slate-400">{incident.status}</span> },
    { key: 'session_id', header: 'Session', render: (incident) => <span className="font-mono text-slate-400">#{incident.session_id}</span> },
    { key: 'created_at', header: 'Created', render: (incident) => formatTime(incident.created_at, true) },
    {
      key: 'open',
      header: '',
      render: (incident) => <Link className="text-xs font-medium text-blue-300 hover:text-blue-200" to={`/admin/incidents/${incident.id}`}>Review</Link>,
    },
  ]

  function changeFilter(name, value) {
    setLoading(true)
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">INVESTIGATION</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Incidents</h1>
          <p className="mt-2 text-sm text-slate-400">Indicators of compromise requiring investigation.</p>
        </section>
        <section className="surface p-4 sm:p-5">
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
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Incident queue</h2>
            <span className="text-xs text-slate-500">{total} total</span>
          </div>
          <DataTable
            columns={columns}
            emptyDescription="Try changing the active filters."
            emptyTitle="No incidents match"
            loading={loading}
            rows={incidents}
            rowClassName={(incident) => incident.severity === 'critical' ? 'bg-critical/[0.035]' : ''}
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
