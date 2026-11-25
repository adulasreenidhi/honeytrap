import { useCallback, useEffect, useMemo, useState } from 'react'
import { Laptop, MapPin, RefreshCw, ShieldCheck } from 'lucide-react'
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
  const color = value > 70 ? 'bg-allow' : value > 40 ? 'bg-warning' : 'bg-critical'
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-right font-mono text-xs text-slate-300">{value}</span>
    </div>
  )
}

function SessionStatus({ status }) {
  const styles = {
    active: 'bg-allow/10 text-allow ring-allow/20',
    restricted: 'bg-warning/10 text-amber-300 ring-warning/20',
    denied: 'bg-critical/10 text-red-300 ring-critical/20',
  }
  const normalized = String(status || '').toLowerCase()
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${styles[normalized] || 'bg-slate-500/10 text-slate-400 ring-slate-500/20'}`}>
      {normalized || 'unknown'}
    </span>
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

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">CONTINUOUS TRUST</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Trust monitoring</h1>
          <p className="mt-2 text-sm text-slate-400">Review active sessions, trust history, and simulated context changes.</p>
        </section>

        {loading ? (
          <div className="surface"><Spinner label="Loading active sessions" /></div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="surface overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Active sessions</h2>
                <p className="mt-1 text-xs text-slate-500">{sessions.length} monitored sessions</p>
              </div>
              {sessions.length ? (
                <ul className="divide-y divide-white/[0.05]">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        aria-pressed={selectedId === session.id}
                        className={`w-full px-5 py-4 text-left transition-colors hover:bg-white/[0.025] ${selectedId === session.id ? 'bg-accent/[0.06] shadow-[inset_3px_0_0_#3b82f6]' : ''}`}
                        onClick={() => {
                          setSelectedId(session.id)
                          setTrustData(null)
                          setDetailLoading(true)
                          setDecision(null)
                        }}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-200">User ID {session.user_id}</span>
                          <SessionStatus status={session.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1"><Laptop size={12} aria-hidden="true" />{session.device_id}</span>
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

            <div className="space-y-5">
              {selectedSession ? (
                <>
                  <section className="surface p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="eyebrow">SESSION {selectedSession.id}</p>
                        <h2 className="mt-1 text-lg font-semibold text-white">Trust assessment</h2>
                      </div>
                      <button
                        className="button-secondary min-h-9 px-3 py-1.5 text-xs"
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
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="eyebrow">Current score</p>
                            <p className="mt-1 text-xl font-semibold text-white">{trustData.current_assessment.score}<span className="ml-1 text-xs text-slate-500">/100</span></p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="eyebrow">Status</p>
                            <div className="mt-2"><SessionStatus status={trustData.current_assessment.status} /></div>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="eyebrow">Change</p>
                            <p className="mt-1 text-xl font-semibold text-white">{Number(trustData.current_assessment.delta) > 0 ? '+' : ''}{trustData.current_assessment.delta}</p>
                          </div>
                        </div>
                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-300">Trust history</p>
                            {threshold !== null && <span className="text-[10px] text-warning">Restrict threshold: {threshold}</span>}
                          </div>
                          <TrustTrendChart data={chartData} threshold={threshold} variant="line" height={220} />
                        </div>
                        <div className="mt-4">
                          <p className="eyebrow">CONTRIBUTING FACTORS</p>
                          {trustData.current_assessment.contributing_factors?.length ? (
                            <ul className="mt-2 space-y-2">
                              {trustData.current_assessment.contributing_factors.map((factor, index) => (
                                <li className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-300" key={`${index}-${JSON.stringify(factor)}`}>
                                  {typeof factor === 'string' ? factor : JSON.stringify(factor)}
                                </li>
                              ))}
                            </ul>
                          ) : <p className="mt-2 text-xs text-slate-500">No contributing factors reported.</p>}
                        </div>
                      </>
                    ) : <EmptyState title="Trust history unavailable" />}
                  </section>

                  <section className="surface p-5 sm:p-6">
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg border border-warning/20 bg-warning/[0.07] p-2 text-warning"><ShieldCheck size={17} aria-hidden="true" /></span>
                      <div>
                        <p className="eyebrow">SIMULATION ONLY</p>
                        <h2 className="mt-1 text-sm font-semibold text-white">Simulate session context</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Synthetic changes update the local demo session only.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="field-label" htmlFor="simulation-device">Device profile</label>
                        <select className="text-field py-2 text-xs" disabled={simulating} id="simulation-device" onChange={(event) => setDeviceId(event.target.value)} value={deviceId}>
                          {DEVICE_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                        </select>
                        <button className="button-secondary w-full text-xs" disabled={simulating} onClick={() => simulate('device')} type="button">
                          {simulating ? 'Simulating…' : 'Simulate device change'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        <label className="field-label" htmlFor="simulation-location">Location</label>
                        <input className="text-field py-2 text-xs" disabled={simulating} id="simulation-location" onChange={(event) => setLocation(event.target.value)} value={location} />
                        <button className="button-secondary w-full text-xs" disabled={simulating || !location.trim()} onClick={() => simulate('location')} type="button">
                          {simulating ? 'Simulating…' : 'Simulate location change'}
                        </button>
                      </div>
                    </div>
                    {decision && <div className="mt-5"><DecisionBanner result={decision} /></div>}
                    <p className="mt-4 text-[10px] text-slate-600">Session last activity: {formatTime(selectedSession.last_activity_at, true)}</p>
                  </section>
                </>
              ) : (
                <div className="surface"><EmptyState title="Select a session" description="Choose a session to inspect its live assessment and history." /></div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
