import { useEffect, useState } from 'react'
import { Download, FileText, Printer, ShieldAlert, Siren } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { auditReport, downloadAuditCsv, incidentReport, listIncidents } from '../../api/client.js'
import DataTable from '../../components/DataTable.jsx'
import FilterBar from '../../components/FilterBar.jsx'
import JsonViewer from '../../components/JsonViewer.jsx'
import Layout from '../../components/Layout.jsx'
import Pagination from '../../components/Pagination.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatCard from '../../components/StatCard.jsx'
import Timeline from '../../components/Timeline.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

function toApiDate(value, isEnd = false) {
  if (!value) return ''
  return `${value}T${isEnd ? '23:59:59' : '00:00:00'}`
}

function IncidentReport({ reportId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    incidentReport(reportId)
      .then((data) => { if (active) setReport(data) })
      .catch((error) => notify(error.detail || error.error || 'Unable to load incident report.', 'error'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reportId])

  if (loading) return <div className="card"><Spinner label="Loading incident report" /></div>
  if (!report) return <div className="card p-5 text-sm text-muted">This incident report is unavailable.</div>
  const incident = report.incident

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">SIMULATED INCIDENT REPORT · #{incident.id}</p>
          <h1 className="mt-2 text-2xl font-bold text-text sm:text-3xl">{incident.title}</h1>
          <p className="mt-2 text-sm text-muted">An indicator of compromise requiring investigation.</p>
        </div>
        <button className="btn-primary button-primary no-print shadow-glow-sm" onClick={() => window.print()} type="button">
          <Printer size={15} />Print / Save as PDF
        </button>
      </header>

      <article className="print-report space-y-5 rounded-2xl">
        <section className="print-light card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge value={incident.severity} />
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {incident.status}
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-text">{incident.summary || 'An indicator of compromise requiring investigation.'}</p>
          <div className="mt-5 grid gap-3 text-xs text-muted sm:grid-cols-3">
            <p>Incident ID <strong className="font-semibold text-text">#{incident.id}</strong></p>
            <p>Session ID <strong className="font-semibold text-text">#{incident.session_id}</strong></p>
            <p>Generated <strong className="font-semibold text-text tabular-nums">{formatTime(report.generated_at, true)}</strong></p>
          </div>
          {incident.analyst_notes && (
            <div className="mt-5 border-t border-border pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Analyst notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text">{incident.analyst_notes}</p>
            </div>
          )}
        </section>

        <section className="print-light card p-5 sm:p-6">
          <h2 className="mb-6 text-sm font-bold text-text">Timeline</h2>
          <Timeline items={report.timeline || []} />
        </section>
        <section className="print-light card p-5 sm:p-6">
          <JsonViewer title="Evidence snapshot" value={report.evidence_snapshot} />
        </section>
      </article>
    </div>
  )
}

function AuditReports() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await auditReport({
          from: toApiDate(dateRange.from),
          to: toApiDate(dateRange.to, true),
          page,
          page_size: pageSize,
        })
        if (!active) return
        setItems(data.items)
        setTotal(data.total)
      } catch (error) {
        if (active) notify(error.detail || error.error || 'Unable to load audit report.', 'error')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [dateRange, page, pageSize])

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadAuditCsv({ from: toApiDate(dateRange.from), to: toApiDate(dateRange.to, true) })
      notify('Audit CSV downloaded.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to export audit CSV.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { key: 'timestamp', header: 'Timestamp', render: (item) => <span className="tabular-nums">{formatTime(item.timestamp, true)}</span> },
    { key: 'event_type', header: 'Event', render: (item) => <span className="capitalize text-text font-medium">{item.event_type.replaceAll('_', ' ')}</span> },
    { key: 'severity', header: 'Severity', render: (item) => <SeverityBadge value={item.severity} /> },
    { key: 'user_id', header: 'User', render: (item) => <span className="font-mono text-muted">#{item.user_id}</span> },
    { key: 'session_id', header: 'Session', render: (item) => <span className="font-mono text-muted">#{item.session_id}</span> },
    { key: 'risk_points', header: 'Risk', render: (item) => <span className="tabular-nums font-mono">{item.risk_points}</span> },
  ]

  const dateFilters = [
    { name: 'from', label: 'From', type: 'date' },
    { name: 'to', label: 'To', type: 'date' },
  ]

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">AUDIT EXPORT</p>
          <h2 className="mt-1 text-lg font-bold text-text">Activity audit</h2>
        </div>
        <button className="btn-secondary button-secondary" disabled={exporting} onClick={exportCsv} type="button">
          <Download size={15} />{exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <section className="card p-4 sm:p-5">
        <FilterBar filters={dateFilters} onChange={(name, value) => { setLoading(true); setPage(1); setDateRange((current) => ({ ...current, [name]: value })) }} onReset={() => { setLoading(true); setPage(1); setDateRange({ from: '', to: '' }) }} values={dateRange} />
      </section>
      <section className="card overflow-hidden">
        <div className="border-b border-border bg-surface-2/40 px-5 py-4"><h3 className="text-sm font-bold text-text">JSON preview</h3></div>
        <DataTable columns={columns} emptyTitle="No audit events found" loading={loading} rows={items} />
        {!loading && items.length > 0 && (
          <details className="border-t border-border px-5 py-4 bg-surface-2/20">
            <summary className="cursor-pointer text-xs font-semibold text-brand hover:text-brand-light transition-colors">View current page JSON</summary>
            <div className="mt-4"><JsonViewer title="Audit page data" value={items} /></div>
          </details>
        )}
        <Pagination disabled={loading} onChange={(nextPage, nextPageSize) => { setLoading(true); setPage(nextPage); setPageSize(nextPageSize) }} page={page} pageSize={pageSize} total={total} />
      </section>
    </section>
  )
}

export default function Reports() {
  const { id } = useParams()
  const [incidents, setIncidents] = useState([])
  const [incidentLoading, setIncidentLoading] = useState(true)

  useEffect(() => {
    if (id) return undefined
    let active = true
    listIncidents({ page: 1, page_size: 100 })
      .then((data) => { if (active) setIncidents(data.items) })
      .catch((error) => notify(error.detail || error.error || 'Unable to load incidents for reports.', 'error'))
      .finally(() => { if (active) setIncidentLoading(false) })
    return () => { active = false }
  }, [id])

  return (
    <Layout>
      {id ? (
        <IncidentReport reportId={id} />
      ) : (
        <div className="space-y-8">
          <section>
            <p className="eyebrow">REPORTING</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Reports</h1>
            <p className="mt-2 text-sm text-muted">Incident evidence and paginated activity audit exports.</p>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Incidents" value={incidents.length} icon={Siren} />
            <StatCard label="Critical Reports" value={incidents.filter((i) => i.severity === 'critical').length} icon={ShieldAlert} />
            <StatCard label="Open Investigations" value={incidents.filter((i) => i.status === 'open').length} icon={FileText} />
          </section>
          <section className="space-y-4">
            <div>
              <p className="eyebrow">INCIDENT REPORTS</p>
              <h2 className="mt-1 text-lg font-bold text-text">Select an incident</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {incidentLoading ? (
                <div className="card md:col-span-2"><Spinner label="Loading incident reports" /></div>
              ) : incidents.length ? incidents.map((incident) => (
                <Link className="card flex items-start justify-between gap-3 p-4 transition-all duration-200 hover:border-brand/40 hover:shadow-glow-sm" key={incident.id} to={`/admin/reports/${incident.id}`}>
                  <div>
                    <p className="text-sm font-semibold text-text">{incident.title}</p>
                    <p className="mt-0.5 text-xs text-muted">Indicator of compromise requiring investigation · #{incident.id}</p>
                    <p className="mt-2 text-[10px] text-faint tabular-nums">{formatTime(incident.created_at, true)}</p>
                  </div>
                  <SeverityBadge value={incident.severity} />
                </Link>
              )) : <div className="card p-6 text-sm text-muted md:col-span-2">No incident reports are available.</div>}
            </div>
          </section>
          <AuditReports />
        </div>
      )}
    </Layout>
  )
}
