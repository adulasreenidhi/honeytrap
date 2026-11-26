import { useCallback, useEffect, useMemo, useState } from 'react'
import { Laptop, MapPin, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { activeSessions, getSessionTrust, listPolicies, simulateDeviceChange, simulateLocationChange } from '../../api/client.js'
import DecisionBanner from '../../components/DecisionBanner.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import Layout from '../../components/Layout.jsx'
import Spinner from '../../components/Spinner.jsx'
import TrustTrendChart from '../../components/TrustTrendChart.jsx'
import { DEVICE_PROFILES } from '../../utils/constants.js'
import { formatTime } from '../../utils/format.js'
import { notify } from '../../utils/notify.js'

function TrustBar({ score }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0))
  const color = value > 70 ? 'bg-success' : value > 40 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 border border-border/40">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-right font-mono text-xs font-semibold text-text tabular-nums">{value}</span>
    </div>
  )
}

function LargeTrustGauge({ score }) {
  const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0
  const color = safeScore > 70 ? '#22c55e' : safeScore > 40 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 45
  const offset = circumference * (1 - safeScore / 100)

  return (
    <div className="relative flex flex-col items-center justify-center p-2" role="img" aria-label={`Trust score ${safeScore} out of 100`}>
      <svg className="h-36 w-36 -rotate-90 drop-shadow-[0_0_15px_rgba(249,115,22,0.2)]" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#2e2318" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-extrabold text-text tabular-nums">{safeScore}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-faint">/ 100</span>
      </div>
    </div>
  )
}

function SessionStatus({ status }) {
  const styles = {
    active: 'border-success/30 bg-success/10 text-success',
    restricted: 'border-warning/30 bg-warning/10 text-warning',
    denied: 'border-danger/30 bg-danger/10 text-danger',
  }
  const normalized = String(status || '').toLowerCase()
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[normalized] || 'border-border bg-surface-2 text-muted'}`}>
      {normalized || 'unknown'}
    </span>
  )
}

function FactorProgressBar({ factor }) {
  const text = typeof factor === 'string' ? factor : JSON.stringify(factor)
  const match = text.match(/\(([+-]?\d+)\)/)
  const delta = match ? Number(match[1]) : 0
  const isPositive = delta > 0

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text">{text}</span>
        {delta !== 0 && (
          <span className={`font-mono font-bold tabular-nums ${isPositive ? 'text-danger' : 'text-success'}`}>
            {isPositive ? `+${delta}` : delta} pts
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full ${delta > 20 ? 'bg-danger' : delta > 0 ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${Math.min(100, Math.max(15, Math.abs(delta) * 3))}%` }}
        />
      </div>
    </div>
  )
}

export default function TrustMonitoring() {
  const [sessions, setSessions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [trustData, setTrustData] = useState(null)
  const [threshold, setThreshold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [deviceId, setDeviceId] = useState(DEVICE_PROFILES[1].id)
  const [location, setLocation] = useState('Remote Demo Location')
  const [decision, setDecision] = useState(null)

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) || null,
    [sessions, selectedId],
  )

  const refreshSessions = useCallback(async () => {
    const data = await activeSessions()
    setSessions(data)
    if (selectedId && !data.some((session) => session.id === selectedId)) {
      setSelectedId(data[0]?.id ?? null)
    } else if (selectedId === null && data.length) {
      setSelectedId(data[0].id)
    }
    return data
  }, [selectedId])

  const refreshTrust = useCallback(async (sessionId = selectedId) => {
    if (sessionId === null || sessionId === undefined) {
      setTrustData(null)
      return null
    }
    setDetailLoading(true)
    try {
      const data = await getSessionTrust(sessionId)
      setTrustData(data)
      return data
    } finally {
      setDetailLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const [sessionRows, policies] = await Promise.all([
          activeSessions(),
          listPolicies(),
        ])
        if (!active) return
        setSessions(sessionRows)
        setSelectedId(sessionRows[0]?.id ?? null)
        setDetailLoading(Boolean(sessionRows.length))
        const restrictPolicy = policies.find((policy) => policy.rule_key === 'restrict_threshold' && policy.enabled)
        setThreshold(restrictPolicy?.value ?? null)
      } catch (error) {
        notify(error.detail || error.error || 'Unable to load trust monitoring data.', 'error')
      } finally {
        if (active) setLoading(false)
      }
    }
    initialize()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (selectedId === null) {
      return undefined
    }
    let active = true
    getSessionTrust(selectedId)
      .then((data) => {
        if (active) setTrustData(data)
      })
      .catch((error) => notify(error.detail || error.error || 'Unable to load session trust history.', 'error'))
      .finally(() => {
        if (active) setDetailLoading(false)
      })
    return () => { active = false }
  }, [selectedId])

  async function simulate(kind) {
    if (!selectedSession) return
    setSimulating(true)
    setDecision(null)
    try {
      const result = kind === 'device'
        ? await simulateDeviceChange(selectedSession.id, deviceId)
        : await simulateLocationChange(selectedSession.id, location.trim())
      setDecision(result)
      await Promise.all([refreshSessions(), refreshTrust(selectedSession.id)])
      notify(`${kind === 'device' ? 'Device' : 'Location'} simulation completed.`, 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Simulation could not be completed.', 'error')
    } finally {
      setSimulating(false)
    }
  }

  const chartData = (trustData?.history || []).map((item) => ({
    time: item.timestamp,
    score: item.score,
  }))

  const currentScore = trustData?.current_assessment?.score ?? selectedSession?.trust_score ?? 100
  const trustLevel = currentScore > 70
    ? { level: 'Good', badge: 'border-success/30 bg-success/10 text-success', description: 'Session maintains healthy trust score. Full access permitted.' }
    : currentScore > 40
      ? { level: 'Warning', badge: 'border-warning/30 bg-warning/10 text-warning', description: 'Risk points detected. Step-up verification or restrictions apply.' }
      : { level: 'Critical', badge: 'border-danger/30 bg-danger/10 text-danger', description: 'Severe trust degradation. Immediate containment recommended.' }

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">ZERO TRUST TELEMETRY</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Trust Monitoring</h1>
          <p className="mt-1 text-sm text-muted">Continuous session evaluation, dynamic risk factor breakdown, and context simulation.</p>
        </section>

        {loading ? (
          <div className="card"><Spinner label="Loading active sessions" /></div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            {/* Active Sessions List Table */}
            <section className="card overflow-hidden">
              <div className="border-b border-border bg-surface-2/40 px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-text">Active Sessions</h2>
                  <p className="mt-0.5 text-xs text-muted">{sessions.length} sessions monitored</p>
                </div>
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              </div>
              {sessions.length ? (
                <ul className="divide-y divide-border/60">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        aria-pressed={selectedId === session.id}
                        className={`w-full px-5 py-4 text-left transition-colors hover:bg-surface-2/70 ${selectedId === session.id ? 'bg-brand/10 border-l-2 border-l-brand' : ''}`}
                        onClick={() => {
                          setSelectedId(session.id)
                          setTrustData(null)
                          setDetailLoading(true)
                          setDecision(null)
                        }}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-text">User ID #{session.user_id}</span>
                          <SessionStatus status={session.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                          <span className="inline-flex items-center gap-1 font-mono"><Laptop size={12} aria-hidden="true" />{session.device_id}</span>
                          <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{session.location}</span>
                        </div>
                        <div className="mt-3"><TrustBar score={session.trust_score} /></div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No active sessions" description="Sessions will appear here when users sign in." />
              )}
            </section>

            {/* Right: Inspection, Gauge, Level Card, Factors, History, Simulation */}
            <div className="space-y-5">
              {selectedSession ? (
                <>
                  <section className="card p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="eyebrow">SESSION #{selectedSession.id} ASSESSMENT</p>
                        <h2 className="mt-1 text-lg font-bold text-text">Live Trust Assessment</h2>
                      </div>
                      <button
                        className="btn-secondary button-secondary min-h-9 px-3 py-1.5 text-xs"
                        disabled={detailLoading}
                        onClick={() => refreshTrust()}
                        type="button"
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        Refresh
                      </button>
                    </div>

                    {detailLoading && !trustData ? (
                      <Spinner label="Loading trust history" />
                    ) : trustData ? (
                      <>
                        {/* Hero Row: Circular Gauge + Trust Level Card */}
                        <div className="mt-5 grid gap-4 sm:grid-cols-2 items-center rounded-2xl border border-border bg-surface-2/30 p-4">
                          <div className="flex flex-col items-center justify-center">
                            <LargeTrustGauge score={currentScore} />
                            <p className="mt-1 text-xs font-semibold text-text">Calculated Session Trust</p>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${trustLevel.badge}`}>
                                Trust Level: {trustLevel.level}
                              </span>
                            </div>
                            <p className="text-xs leading-5 text-muted">{trustLevel.description}</p>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                              <div>
                                <span className="text-faint text-[10px] uppercase font-semibold">Change</span>
                                <p className="font-mono font-bold text-text tabular-nums">
                                  {Number(trustData.current_assessment.delta) > 0 ? '+' : ''}{trustData.current_assessment.delta} pts
                                </p>
                              </div>
                              <div>
                                <span className="text-faint text-[10px] uppercase font-semibold">Status</span>
                                <div className="mt-0.5"><SessionStatus status={trustData.current_assessment.status} /></div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Factor Progress Bars */}
                        <div className="mt-5">
                          <p className="eyebrow">CONTRIBUTING RISK FACTORS</p>
                          {trustData.current_assessment.contributing_factors?.length ? (
                            <div className="mt-2.5 space-y-2">
                              {trustData.current_assessment.contributing_factors.map((factor, index) => (
                                <FactorProgressBar factor={factor} key={`${index}-${JSON.stringify(factor)}`} />
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 rounded-xl border border-border bg-surface-2/40 p-3 flex items-center gap-2 text-xs text-success">
                              <CheckCircle2 size={16} />
                              <span>No anomalous risk factors detected for this session.</span>
                            </div>
                          )}
                        </div>

                        {/* Trust History Chart with Reference Line */}
                        <div className="mt-6 border-t border-border pt-5">
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <h3 className="text-xs font-bold text-text">Trust Score History</h3>
                              <p className="text-[11px] text-muted">Chronological progression of access evaluations</p>
                            </div>
                            {threshold !== null && (
                              <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/30 rounded-full px-2.5 py-0.5">
                                Restrict threshold: {threshold}
                              </span>
                            )}
                          </div>
                          <TrustTrendChart data={chartData} threshold={threshold} variant="line" height={220} />
                        </div>
                      </>
                    ) : <EmptyState title="Trust history unavailable" />}
                  </section>

                  {/* Context Simulation Card - Clearly Labeled "Simulation only" */}
                  <section className="card p-5 sm:p-6 border-warning/30 bg-surface/90 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="rounded-xl border border-warning/30 bg-warning/10 p-2 text-warning">
                          <ShieldCheck size={18} aria-hidden="true" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-warning/35 bg-warning/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                              Simulation only
                            </span>
                          </div>
                          <h2 className="mt-1 text-sm font-bold text-text">Simulate Session Context</h2>
                          <p className="mt-0.5 text-xs text-muted">Test trust engine reaction by shifting device or geo-location.</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="field-label" htmlFor="simulation-device">Device profile</label>
                        <select className="input text-field py-2 text-xs" disabled={simulating} id="simulation-device" onChange={(event) => setDeviceId(event.target.value)} value={deviceId}>
                          {DEVICE_PROFILES.map((profile) => <option key={profile.id} value={profile.id} className="bg-surface">{profile.label}</option>)}
                        </select>
                        <button className="btn-secondary button-secondary w-full text-xs" disabled={simulating} onClick={() => simulate('device')} type="button">
                          {simulating ? 'Simulating…' : 'Simulate device change'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        <label className="field-label" htmlFor="simulation-location">Location</label>
                        <input className="input text-field py-2 text-xs" disabled={simulating} id="simulation-location" onChange={(event) => setLocation(event.target.value)} value={location} />
                        <button className="btn-secondary button-secondary w-full text-xs" disabled={simulating || !location.trim()} onClick={() => simulate('location')} type="button">
                          {simulating ? 'Simulating…' : 'Simulate location change'}
                        </button>
                      </div>
                    </div>

                    {decision && <div className="mt-5"><DecisionBanner result={decision} /></div>}
                    <p className="mt-4 text-[10px] text-faint tabular-nums">Session last activity: {formatTime(selectedSession.last_activity_at, true)}</p>
                  </section>
                </>
              ) : (
                <div className="card"><EmptyState title="Select a session" description="Choose a session to inspect its live assessment and history." /></div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
