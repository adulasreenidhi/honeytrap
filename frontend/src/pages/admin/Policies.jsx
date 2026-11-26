import { useEffect, useState } from 'react'
import { Save, ShieldCheck } from 'lucide-react'
import { listPolicies, updatePolicy } from '../../api/client.js'
import Layout from '../../components/Layout.jsx'
import Spinner from '../../components/Spinner.jsx'
import useAuth from '../../context/useAuth.js'
import { notify } from '../../utils/notify.js'

const groups = [
  { title: 'Risk weights', keys: ['unknown_device', 'unusual_location', 'abnormal_file_access', 'suspicious_behaviour', 'decoy_interaction'], min: 0, max: 100, step: 1 },
  { title: 'Thresholds', keys: ['restrict_threshold'], min: 0, max: 100, step: 1 },
  { title: 'Window settings', keys: ['window_minutes', 'max_files_per_window', 'max_searches_per_window'], min: 1, max: 10000, step: 1 },
]

export default function Policies() {
  const { isAdmin } = useAuth()
  const [policies, setPolicies] = useState([])
  const [original, setOriginal] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    let active = true
    listPolicies()
      .then((data) => {
        if (!active) return
        setPolicies(data)
        setOriginal(Object.fromEntries(data.map((policy) => [policy.id, { value: policy.value, enabled: policy.enabled }])))
      })
      .catch((error) => { if (active) notify(error.detail || error.error || 'Unable to load policies.', 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function updateLocal(id, changes) {
    setPolicies((current) => current.map((policy) => policy.id === id ? { ...policy, ...changes } : policy))
  }

  function isDirty(policy) {
    return original[policy.id]?.value !== policy.value || original[policy.id]?.enabled !== policy.enabled
  }

  async function save(policy, min, max) {
    const value = Number(policy.value)
    if (policy.value === '' || !Number.isFinite(value) || value < min || value > max) {
      notify(`Value must be between ${min} and ${max}.`, 'error')
      return
    }
    setSavingId(policy.id)
    try {
      const updated = await updatePolicy(policy.id, { value, enabled: policy.enabled })
      setPolicies((current) => current.map((item) => item.id === policy.id ? updated : item))
      setOriginal((current) => ({ ...current, [policy.id]: { value: updated.value, enabled: updated.enabled } }))
      notify(`${updated.name} saved at ${updated.value}${updated.enabled ? '' : ' (disabled)'}.`, 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to save policy.', 'error')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <section>
          <p className="eyebrow">MANAGE POLICY</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Policies</h1>
          <p className="mt-2 text-sm text-muted">Configure synthetic trust weights and detection windows.</p>
          {!isAdmin && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2 text-xs text-brand-light">
              <ShieldCheck size={14} />Read-only view for analyst role
            </p>
          )}
        </section>

        {loading ? <div className="card"><Spinner label="Loading policies" /></div> : groups.map((group) => {
          const members = group.keys.map((key) => policies.find((policy) => policy.rule_key === key)).filter(Boolean)
          return (
            <section className="card overflow-hidden" key={group.title}>
              <div className="border-b border-border bg-surface-2/40 px-5 py-4">
                <h2 className="text-sm font-bold text-text">{group.title}</h2>
              </div>
              {members.length ? (
                <div className="divide-y divide-border/60">
                  {members.map((policy) => (
                    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_110px_90px_100px] lg:items-center" key={policy.id}>
                      <div>
                        <p className="text-sm font-semibold text-text">{policy.name}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-faint">{policy.rule_key}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          aria-label={`${policy.name} value slider`}
                          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!isAdmin}
                          max={group.max}
                          min={group.min}
                          onChange={(event) => updateLocal(policy.id, { value: Number(event.target.value) })}
                          type="range"
                          value={policy.value}
                        />
                        <input
                          aria-label={`${policy.name} numeric value`}
                          className="input text-field w-24 py-1.5 text-right font-mono text-xs tabular-nums"
                          disabled={!isAdmin}
                          max={group.max}
                          min={group.min}
                          onChange={(event) => updateLocal(policy.id, { value: event.target.value === '' ? '' : Number(event.target.value) })}
                          type="number"
                          value={policy.value}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                        <input
                          checked={policy.enabled}
                          className="h-4 w-4 rounded accent-brand"
                          disabled={!isAdmin}
                          onChange={(event) => updateLocal(policy.id, { enabled: event.target.checked })}
                          type="checkbox"
                        />
                        Enabled
                      </label>
                      <span className="text-[10px] text-faint tabular-nums">Range {group.min}–{group.max}</span>
                      <button
                        className="btn-primary button-primary min-h-9 px-3.5 py-1.5 text-xs shadow-glow-sm"
                        disabled={!isAdmin || !isDirty(policy) || savingId === policy.id}
                        onClick={() => save(policy, group.min, group.max)}
                        type="button"
                      >
                        <Save size={13} />{savingId === policy.id ? 'Saving…' : isDirty(policy) ? 'Save changes' : `${policy.value} saved`}
                      </button>
                    </div>
                  ))}
                </div>
              ) : <p className="px-5 py-6 text-xs text-muted">Policy records are not available.</p>}
            </section>
          )
        })}
      </div>
    </Layout>
  )
}
