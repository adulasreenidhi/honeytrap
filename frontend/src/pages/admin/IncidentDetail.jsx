import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, FileText, Save, ShieldAlert, Siren } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getIncident, patchIncident, respondToIncident } from '../../api/client.js'
import Layout from '../../components/Layout.jsx'
import JsonViewer from '../../components/JsonViewer.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import Spinner from '../../components/Spinner.jsx'
import Timeline from '../../components/Timeline.jsx'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

const responseActions = [
  { value: 'restrict_session', label: 'Restrict session' },
  { value: 'terminate_session', label: 'Terminate session' },
  { value: 'block_sensitive_resources', label: 'Block sensitive resources' },
  { value: 'require_step_up_verification', label: 'Require step-up verification' },
  { value: 'suspend_user', label: 'Suspend user' },
  { value: 'mark_device_revoked', label: 'Mark device revoked' },
]

export default function IncidentDetail() {
  const { id } = useParams()
  const [incident, setIncident] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [responding, setResponding] = useState(false)
  const [status, setStatus] = useState('open')
  const [notes, setNotes] = useState('')
  const [selectedAction, setSelectedAction] = useState(responseActions[0].value)
  const [responseNotes, setResponseNotes] = useState('')
  const [responseResult, setResponseResult] = useState(null)

  const refresh = useCallback(async () => {
    const data = await getIncident(id)
    setIncident(data)
    setStatus(data.status)
    setNotes(data.analyst_notes || '')
    return data
  }, [id])

  useEffect(() => {
    let active = true
    getIncident(id)
      .then((data) => {
        if (!active) return
        setIncident(data)
        setStatus(data.status)
        setNotes(data.analyst_notes || '')
      })
      .catch((error) => notify(error.detail || error.error || 'Unable to load incident details.', 'error'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [id])

  async function saveIncident(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await patchIncident(id, { status, analyst_notes: notes })
      await refresh()
      notify('Incident notes and status saved.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to save incident updates.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function runResponse(event) {
    event.preventDefault()
    const label = responseActions.find((action) => action.value === selectedAction)?.label || selectedAction
    if (!window.confirm(`Confirm simulated response: ${label}?`)) return

    setResponding(true)
    setResponseResult(null)
    try {
      const result = await respondToIncident(id, selectedAction, responseNotes.trim() || undefined)
      setResponseResult(result)
      setResponseNotes('')
      await refresh()
      notify('Simulated response action recorded.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to record response action.', 'error')
    } finally {
      setResponding(false)
    }
  }

  return (
    <Layout>
      {loading ? (
        <div className="surface"><Spinner label="Loading incident" /></div>
      ) : !incident ? (
        <div className="surface p-6">
          <p className="text-sm text-slate-400">Incident details are unavailable.</p>
          <Link className="mt-4 inline-flex text-sm text-blue-300 hover:text-blue-200" to="/admin/incidents">Back to incidents</Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <Link className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-blue-300" to="/admin/incidents">
              <ArrowLeft size={14} aria-hidden="true" />Back to incidents
            </Link>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="eyebrow">INCIDENT {incident.id} · INDICATOR OF COMPROMISE REQUIRING INVESTIGATION</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{incident.title}</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">{incident.summary || 'An indicator of compromise requiring investigation.'}</p>
              </div>
              <div className="flex items-center gap-2">
                <SeverityBadge value={incident.severity} />
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{incident.status}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600">Session #{incident.session_id} · Opened {formatTime(incident.created_at, true)}</p>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="space-y-5">
              <section className="surface p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-accent" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-white">Analyst review</h2>
                </div>
                <form className="mt-5 space-y-4" onSubmit={saveIncident}>
                  <div>
                    <label className="field-label" htmlFor="incident-status">Status</label>
                    <select className="text-field mt-2 max-w-xs" id="incident-status" onChange={(event) => setStatus(event.target.value)} value={status}>
                      {['open', 'investigating', 'resolved'].map((value) => <option className="capitalize" key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="analyst-notes">Analyst notes</label>
                    <textarea
                      className="text-field mt-2 min-h-28 resize-y"
                      id="analyst-notes"
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Record investigation notes…"
                      value={notes}
                    />
                  </div>
                  <button className="button-primary" disabled={saving} type="submit">
                    <Save size={15} aria-hidden="true" />{saving ? 'Saving…' : 'Save review'}
                  </button>
                </form>
              </section>

              <section className="surface p-5 sm:p-6">
                <div className="mb-6">
                  <p className="eyebrow">EVIDENCE</p>
                  <h2 className="mt-1 text-sm font-semibold text-white">Incident timeline</h2>
                </div>
                <Timeline items={incident.timeline || []} />
              </section>

              <details className="surface overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-200 sm:px-6">
                  <FileText size={15} className="text-slate-500" aria-hidden="true" />
                  Evidence snapshot
                  <span className="ml-auto text-[10px] font-normal text-slate-600">Formatted JSON</span>
                </summary>
                <div className="border-t border-white/[0.06] p-4 sm:p-5">
                  <JsonViewer title="Incident evidence" value={incident.evidence_snapshot} />
                </div>
              </details>
            </div>

            <aside className="space-y-5">
              <section className="surface p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg border border-critical/20 bg-critical/[0.07] p-2 text-critical">
                    <ShieldAlert size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="eyebrow">SIMULATION ONLY</p>
                    <h2 className="mt-1 text-sm font-semibold text-white">Response actions</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Actions affect only synthetic records in the local demo database.</p>
                  </div>
                </div>
                <form className="mt-5 space-y-4" onSubmit={runResponse}>
                  <div>
                    <label className="field-label" htmlFor="response-action">Action</label>
                    <select className="text-field mt-2" id="response-action" onChange={(event) => setSelectedAction(event.target.value)} value={selectedAction}>
                      {responseActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="response-notes">Action note (optional)</label>
                    <textarea className="text-field mt-2 min-h-20 resize-y" id="response-notes" onChange={(event) => setResponseNotes(event.target.value)} placeholder="Add a synthetic response note…" value={responseNotes} />
                  </div>
                  <button className="button-warning w-full" disabled={responding} type="submit">
                    <Siren size={15} aria-hidden="true" />{responding ? 'Recording…' : 'Run simulated action'}
                  </button>
                </form>
                {responseResult && (
                  <div className="mt-4 rounded-lg border border-allow/20 bg-allow/[0.05] p-3" role="status">
                    <p className="flex items-center gap-2 text-xs font-semibold text-allow"><AlertTriangle size={14} aria-hidden="true" />Response recorded · simulated: {String(responseResult.simulated)}</p>
                    <p className="mt-2 text-xs text-slate-300">{String(responseResult.action).replaceAll('_', ' ')} · session status: {responseResult.session_status}</p>
                  </div>
                )}
              </section>

              <Link className="button-secondary w-full" to={`/admin/reports/${incident.id}`}>
                <FileText size={15} aria-hidden="true" />View report
              </Link>
            </aside>
          </div>
        </div>
      )}
    </Layout>
  )
}
