import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { listActivity } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

const initialFilters = { user_id: '', session_id: '', event_type: '' }

export default function ActivityLog() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const queryFilters = {
          ...filters,
          user_id: filters.user_id ? Number(filters.user_id) : '',
          session_id: filters.session_id ? Number(filters.session_id) : '',
          page,
          page_size: pageSize,
        }
        const data = await listActivity(queryFilters)
        if (!active) return
        setItems(data.items)
        setTotal(data.total)
      } catch (error) {
        if (active) notify(error.detail || error.error || 'Unable to load activity log.', 'error')
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
    setExpandedId(null)
  }

  const columns = [
    { key: 'timestamp', header: 'Time', render: (item) => <span className="tabular-nums">{formatTime(item.timestamp, true)}</span> },
    { key: 'user_id', header: 'User', render: (item) => <span className="font-mono text-muted">#{item.user_id}</span> },
    { key: 'session_id', header: 'Session', render: (item) => <span className="font-mono text-muted">#{item.session_id}</span> },
    {
      key: 'event_type',
      header: 'Event',
      render: (item) => <span className="font-medium capitalize text-text">{item.event_type.replaceAll('_', ' ')}</span>,
    },
    { key: 'severity', header: 'Severity', render: (item) => <SeverityBadge value={item.severity} /> },
    { key: 'risk_points', header: 'Risk', render: (item) => <span className={item.risk_points > 0 ? 'font-mono font-semibold text-warning tabular-nums' : 'font-mono text-faint tabular-nums'}>{item.risk_points}</span> },
    {
      key: 'details',
      header: 'Details',
      render: (item) => (
        <button
          aria-expanded={expandedId === item.id}
          aria-label={`${expandedId === item.id ? 'Hide' : 'Show'} details for event ${item.id}`}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-brand hover:bg-surface-2 hover:text-brand-light transition-colors"
          onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}
          type="button"
        >
          {expandedId === item.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {expandedId === item.id ? 'Hide' : 'Expand'}
        </button>
      ),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">MONITORING</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Activity log</h1>
          <p className="mt-2 text-sm text-muted">Search and inspect recorded synthetic session activity.</p>
        </section>

        <section className="card p-4 sm:p-5">
          <FilterBar
            filters={[
              { name: 'user_id', label: 'User ID', placeholder: 'e.g. 3', type: 'number' },
              { name: 'session_id', label: 'Session ID', placeholder: 'e.g. 12', type: 'number' },
              { name: 'event_type', label: 'Event type', placeholder: 'e.g. file_access' },
            ]}
            onChange={changeFilter}
            onReset={() => { setLoading(true); setFilters(initialFilters); setPage(1); setExpandedId(null) }}
            values={filters}
          />
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-5 py-4">
            <h2 className="text-sm font-bold text-text">Event stream</h2>
            <span className="text-xs text-muted tabular-nums">{total} events</span>
          </div>
          <DataTable
            columns={columns}
            emptyDescription="Try changing the active filters."
            emptyTitle="No activity found"
            expandedContent={(item) => expandedId === item.id ? (
              <div className="max-w-4xl">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Event details</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-surface-2/90 p-3.5 font-mono text-[11px] leading-5 text-text">{JSON.stringify(item.details || {}, null, 2)}</pre>
              </div>
            ) : null}
            loading={loading}
            rows={items}
            rowClassName={(item) => item.event_type === 'decoy_trigger' ? 'bg-danger/[0.1] border-l-4 border-l-danger shadow-[inset_4px_0_16px_rgba(239,68,68,0.18)] font-semibold' : ''}
          />
          <Pagination
            disabled={loading}
            onChange={(nextPage, nextPageSize) => { setLoading(true); setPage(nextPage); setPageSize(nextPageSize); setExpandedId(null) }}
            page={page}
            pageSize={pageSize}
            total={total}
          />
        </section>
      </div>
    </Layout>
  )
}
