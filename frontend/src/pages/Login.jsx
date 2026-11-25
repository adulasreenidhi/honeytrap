import { useEffect, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import useAuth from '../context/useAuth.js'
import { DEVICE_PROFILES, DEMO_ACCOUNTS, DEMO_PASSWORD, LOCATIONS } from '../utils/constants.js'

export default function Login() {
  const { login, token, user, isLoading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [deviceId, setDeviceId] = useState(DEVICE_PROFILES[0].id)
  const [location, setLocation] = useState(LOCATIONS[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (token && user && !isLoading) {
      navigate(user.role === 'employee' ? '/portal' : '/admin', { replace: true })
    }
  }, [token, user, isLoading, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const signedInUser = await login({ username, password, device_id: deviceId, location })
      navigate(signedInUser.role === 'employee' ? '/portal' : '/admin', { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.detail || requestError.error || 'Sign in failed.'
          : 'Unable to reach HoneyGate. Confirm the backend is running and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-accent/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-blue-900/10 blur-[120px]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-navy-900/80 shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between border-r border-white/[0.06] bg-gradient-to-br from-blue-950/30 to-transparent p-10 lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25">
                <ShieldCheck size={23} aria-hidden="true" />
              </div>
              <div>
                <p className="text-base font-bold tracking-wide text-white">HONEY<span className="text-accent">GATE</span></p>
                <p className="text-[10px] uppercase tracking-[0.17em] text-slate-500">Continuous trust platform</p>
              </div>
            </div>
            <p className="mt-20 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Access with confidence</p>
            <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Every session earns its trust.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              A continuously monitored company workspace that adapts access decisions to your session risk.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <p className="text-xs font-medium text-slate-200">Continuous session assessment</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Trust is recalculated as device, location, and access activity change.</p>
          </div>
        </section>

        <section className="p-6 sm:p-9 lg:p-10">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <ShieldCheck className="text-accent" size={23} aria-hidden="true" />
            <p className="text-sm font-bold tracking-wide text-white">HONEY<span className="text-accent">GATE</span></p>
          </div>
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-xs text-blue-200" role="note">
            Simulated environment: all data is synthetic.
          </div>
          <p className="eyebrow">SECURE SIGN IN</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-400">Sign in to your protected company environment.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor="username">Username</label>
              <input
                autoComplete="username"
                className="text-field mt-2"
                id="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input
                autoComplete="current-password"
                className="text-field mt-2"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="device">Device profile</label>
                <select className="text-field mt-2" id="device" onChange={(event) => setDeviceId(event.target.value)} value={deviceId}>
                  {DEVICE_PROFILES.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="location">Location</label>
                <select className="text-field mt-2" id="location" onChange={(event) => setLocation(event.target.value)} value={location}>
                  {LOCATIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="rounded-lg border border-critical/25 bg-critical/[0.06] px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p>}
            <button className="button-primary mt-2 w-full" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <div className="mt-7 border-t border-white/[0.06] pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Demo accounts · click to fill username</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[11px] text-slate-400 hover:border-accent/40 hover:text-blue-200"
                  key={account}
                  onClick={() => setUsername(account)}
                  type="button"
                >
                  {account}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Shared DEMO password: <span className="font-mono text-slate-300">{DEMO_PASSWORD}</span></p>
          </div>
        </section>
      </div>
    </main>
  )
}
