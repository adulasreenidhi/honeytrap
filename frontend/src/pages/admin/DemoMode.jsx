import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Play, RotateCcw, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listIncidents, resetDemo, runScenario } from '../../api/client.js'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import DecisionBanner from '../../components/DecisionBanner.jsx'
import Layout from '../../components/Layout.jsx'
import TrustTrendChart from '../../components/TrustTrendChart.jsx'
import { notify } from '../../utils/notify.js'

function stepTitle(step) {
  const name = String(step.step || '').replaceAll('_', ' ')
  if (name.startsWith('open file')) return `Unusual file access · ${name}`
  if (name.includes('sensitive')) return 'Sensitive request'
  if (name.includes('decoy')) return 'Decoy trigger'
  if (name.includes('login')) return 'Employee login'
  return name || 'Scenario step'
}

export default function DemoMode() {
  const [scenario, setScenario] = useState(null)
  const [visibleCount, setVisibleCount] = useState(0)
  const [running, setRunning] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [incidentId, setIncidentId] = useState(null)
  const runSequence = useRef(0)

  useEffect(() => () => { runSequence.current += 1 }, [])

  async function startScenario() {
    const sequence = ++runSequence.current
    setRunning(true)
    setScenario(null)
    setVisibleCount(0)
    setIncidentId(null)
    try {
      const result = await runScenario()
      if (sequence !== runSequence.current) return
      setScenario(result)

      const rows = result.steps || []
      for (let index = 0; index < rows.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750))
        if (sequence !== runSequence.current) return
        setVisibleCount(index + 1)
      }

      if (result.alert_and_incident_created) {
        const incidents = await listIncidents({ page: 1, page_size: 100 })
        if (sequence !== runSequence.current) return
        const created = incidents.items.find((incident) => incident.session_id === result.session_id)
        if (created) setIncidentId(created.id)
      }
    } catch (error) {
      if (sequence === runSequence.current) {
        notify(error.detail || error.error || 'Unable to run the simulated scenario.', 'error')
      }
    } finally {
      if (sequence === runSequence.current) setRunning(false)
    }
  }

  async function confirmReset() {
    setResetting(true)
    try {
      const result = await resetDemo()
      runSequence.current += 1
      setScenario(null)
      setVisibleCount(0)
      setIncidentId(null)
      setResetOpen(false)
      notify(result.detail || 'Synthetic demo data reset.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to reset demo data.', 'error')
    } finally {
      setResetting(false)
    }
  }

  const shownSteps = scenario?.steps?.slice(0, visibleCount) || []
  const chartData = shownSteps
    .filter((step) => Number.isFinite(Number(step.trust_score)))
    .map((step, index) => ({ time: `${index + 1}. ${stepTitle(step)}`, score: Number(step.trust_score) }))
  const complete = Boolean(scenario && !running && visibleCount === scenario.steps?.length)

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">SIMULATED SCENARIOS</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Demo mode</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Run a local synthetic scenario to observe trust changes, a monitored alert, and its investigation record. No external systems are contacted.
          </p>
        </section>

        <section className="card flex flex-col justify-between gap-5 border-warning/25 bg-surface/90 p-5 sm:flex-row sm:items-center sm:p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="rounded-xl border border-warning/30 bg-warning/10 p-2.5 text-warning"><ShieldAlert size={20} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">SIMULATED ONLY</p>
              <h2 className="mt-1 text-sm font-bold text-text">Run attack scenario</h2>
              <p className="mt-0.5 max-w-xl text-xs leading-5 text-muted">Creates synthetic session activity, trust evaluations, an alert, and an incident in the local demo database.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button className="btn-primary button-primary shadow-glow-sm" disabled={running} onClick={startScenario} type="button">
              <Play size={15} />{running ? 'Scenario running…' : 'Run attack scenario'}
            </button>
            <button className="btn-secondary button-secondary" disabled={running || resetting} onClick={() => setResetOpen(true)} type="button">
              <RotateCcw size={15} />Reset demo data
            </button>
          </div>
        </section>

        {scenario && (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <section className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">SCENARIO SESSION #{scenario.session_id} · SIMULATED</p>
                  <h2 className="mt-1 text-base font-bold text-text">Execution timeline</h2>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${complete ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}>
                  {complete ? 'Complete' : 'In progress'}
                </span>
              </div>
              <ol className="mt-6 space-y-4">
                {shownSteps.map((step, index) => (
                  <li className="relative pl-7" key={`${index}-${step.step}`}>
                    <span className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-brand/40 bg-brand/15 text-brand shadow-glow-sm">
                      <CheckCircle2 size={12} aria-hidden="true" />
                    </span>
                    <h3 className="mb-2 text-xs font-semibold capitalize text-text">{stepTitle(step)}</h3>
                    <DecisionBanner result={{
                      decision: step.decision || 'ALLOW',
                      trust_score: step.trust_score,
                      reasons: step.reasons || [],
                      triggered_rules: step.triggered_rules || [],
                    }} />
                    {step.resource && <p className="mt-2 text-[10px] text-muted">Synthetic resource: <span className="font-mono text-brand-light">{step.resource}</span></p>}
                  </li>
                ))}
                {complete && (
                  <>
                    {scenario.alert_and_incident_created && (
                      <li className="relative pl-7">
                        <span className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger"><ShieldAlert size={12} /></span>
                        <p className="text-xs font-bold text-danger">Alert and incident created</p>
                        <p className="mt-1 text-[11px] text-muted">Indicator of compromise requiring investigation.</p>
                        {incidentId && (
                          <Link className="mt-2 inline-flex text-xs font-semibold text-brand hover:text-brand-light transition-colors" to={`/admin/incidents/${incidentId}`}>
                            Review incident #{incidentId}
                          </Link>
                        )}
                      </li>
                    )}
                    <li className="relative pl-7">
                      <span className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success"><CheckCircle2 size={12} /></span>
                      <p className="text-xs font-semibold capitalize text-text">Session contained · final status: {scenario.final_status}</p>
                      <p className="mt-1 text-[11px] text-muted">Simulated outcome recorded in the local database.</p>
                    </li>
                  </>
                )}
              </ol>
              {complete && (
                <div className="mt-6 rounded-xl border border-border bg-surface-2/60 px-4 py-3">
                  <p className="text-xs text-muted">Final session status</p>
                  <p className="mt-1 text-sm font-bold capitalize text-text">{scenario.final_status}</p>
                </div>
              )}
            </section>

            <section className="card p-5 sm:p-6">
              <p className="eyebrow">LIVE SIMULATION</p>
              <h2 className="mt-1 text-sm font-bold text-text">Trust score progression</h2>
              {chartData.length ? (
                <div className="mt-4"><TrustTrendChart data={chartData} variant="line" height={280} /></div>
              ) : <p className="py-12 text-center text-xs text-faint">Trust history will appear as the scenario plays.</p>}
              <p className="mt-3 text-[10px] text-faint">All scenario events and outcomes are synthetic.</p>
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        busy={resetting}
        confirmLabel="Reset demo data"
        description="This clears synthetic sessions, activity, alerts, incidents, and response actions, then restores seed data."
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        open={resetOpen}
        title="Reset simulated data"
      />
    </Layout>
  )
}
