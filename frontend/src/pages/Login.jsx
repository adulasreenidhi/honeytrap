import { useEffect, useState } from 'react'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import useAuth from '../context/useAuth.js'
import BrandLogo from '../components/BrandLogo.jsx'
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
          : 'Unable to reach HoneyTrap. Confirm the backend is running and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-8 sm:px-6 lg:px-12">
      {/* Ambient orange glow backdrops */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full bg-brand/12 blur-[140px]" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-[420px] w-[420px] rounded-full bg-brand-dark/12 blur-[160px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-brand/5 blur-[120px]" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl lg:rounded-3xl border border-border bg-surface/75 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr] ring-1 ring-border-glow">
        {/* Left Section: Shield-with-lock illustration, wordmark, tagline */}
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-gradient-to-br from-surface-2/90 via-surface/80 to-bg p-10 lg:flex">
          {/* Subtle background honeycomb grid */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:20px_20px]" />

          <div className="relative z-10">
            <BrandLogo size="lg" tagline="Continuous trust platform" />

            <div className="mt-12 flex justify-center">
              {/* Big shield-with-lock illustration with orange glow */}
              <div className="relative flex items-center justify-center">
                <div className="absolute h-56 w-56 rounded-full bg-brand/20 blur-2xl" />
                <svg
                  className="relative h-48 w-48 drop-shadow-[0_0_35px_rgba(249,115,22,0.4)]"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="shieldGradLarge" x1="15" y1="10" x2="105" y2="108" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fb923c" />
                      <stop offset="0.6" stopColor="#f97316" />
                      <stop offset="1" stopColor="#c2570c" />
                    </linearGradient>
                    <linearGradient id="shieldBgGrad" x1="60" y1="15" x2="60" y2="105" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#221a12" stopOpacity="0.95" />
                      <stop offset="1" stopColor="#14100c" stopOpacity="0.98" />
                    </linearGradient>
                    <linearGradient id="lockGrad" x1="42" y1="34" x2="78" y2="84" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fb923c" />
                      <stop offset="1" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>

                  {/* Outer Hexagon Shield Outline */}
                  <path
                    d="M60 10L102 28V60C102 88 60 108 60 108C60 108 18 88 18 60V28L60 10Z"
                    fill="url(#shieldBgGrad)"
                    stroke="url(#shieldGradLarge)"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />

                  {/* Honeycomb lattice accents inside shield */}
                  <path
                    d="M60 22L72 29V43L60 50L48 43V29L60 22Z"
                    stroke="#fb923c"
                    strokeWidth="1.2"
                    strokeOpacity="0.3"
                    fill="none"
                  />
                  <path
                    d="M48 43L36 50V64L48 71L60 64"
                    stroke="#fb923c"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                    fill="none"
                  />
                  <path
                    d="M72 43L84 50V64L72 71L60 64"
                    stroke="#fb923c"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                    fill="none"
                  />

                  {/* Lock Shackle */}
                  <path
                    d="M47 54V43C47 35.8 52.8 30 60 30C67.2 30 73 35.8 73 43V54"
                    stroke="url(#lockGrad)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />

                  {/* Lock Body */}
                  <rect
                    x="40"
                    y="52"
                    width="40"
                    height="32"
                    rx="8"
                    fill="#1b150f"
                    stroke="url(#shieldGradLarge)"
                    strokeWidth="2.2"
                  />

                  {/* Lock Keyhole */}
                  <circle cx="60" cy="65" r="3.5" fill="#fb923c" />
                  <path d="M60 68.5V74" stroke="#fb923c" strokeWidth="2.2" strokeLinecap="round" />

                  {/* Subtle sparkle accents */}
                  <circle cx="92" cy="38" r="1.5" fill="#fb923c" opacity="0.8" />
                  <circle cx="28" cy="46" r="1.2" fill="#fb923c" opacity="0.6" />
                </svg>
              </div>
            </div>

            <div className="mt-8 text-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-text">
                HONEY<span className="bg-gradient-to-r from-brand-light to-brand-dark bg-clip-text text-transparent">TRAP</span>
              </h1>
              <p className="mt-2 text-base font-semibold text-brand-light tracking-wide">
                Deceive. Detect. Stay Secure.
              </p>
              <p className="mt-4 text-xs leading-6 text-muted max-w-sm mx-auto">
                Next-generation cyber deception platform combining decoy resources, active telemetry, and zero-trust session scoring.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-8 rounded-xl border border-border bg-surface-2/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-text">
              <Sparkles size={14} className="text-brand" aria-hidden="true" />
              <span>Simulated SOC Telemetry</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              Dynamic session risk calculation adapts access rights across corporate laptops, mobile, and remote networks.
            </p>
          </div>
        </section>

        {/* Right Section: Glass card containing existing form fields */}
        <section className="p-6 sm:p-9 lg:p-10 flex flex-col justify-center">
          {/* Mobile header */}
          <div className="mb-6 lg:hidden">
            <BrandLogo size="md" tagline="Deceive. Detect. Stay Secure." />
          </div>

          {/* Simulated environment banner */}
          <div className="mb-6 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-xs text-brand-light flex items-center gap-2" role="note">
            <ShieldCheck size={16} className="text-brand shrink-0" aria-hidden="true" />
            <span>Simulated environment: all data is synthetic.</span>
          </div>

          <p className="eyebrow">SECURE SIGN IN</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-text">Welcome back</h2>
          <p className="mt-1 text-xs sm:text-sm text-muted">Sign in to your protected company environment.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor="username">Username</label>
              <input
                autoComplete="username"
                className="input text-field mt-1.5"
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
                className="input text-field mt-1.5"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="device">Device profile</label>
                <select className="input text-field mt-1.5" id="device" onChange={(event) => setDeviceId(event.target.value)} value={deviceId}>
                  {DEVICE_PROFILES.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="location">Location</label>
                <select className="input text-field mt-1.5" id="location" onChange={(event) => setLocation(event.target.value)} value={location}>
                  {LOCATIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
            {error && (
              <p className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-xs sm:text-sm text-danger font-medium" role="alert">
                {error}
              </p>
            )}
            <button className="btn-primary button-primary mt-2 w-full py-2.5 shadow-glow" disabled={submitting} type="submit">
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          {/* Demo accounts selector */}
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Demo accounts · click to fill username
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-1 font-mono text-[11px] text-muted hover:border-brand/40 hover:bg-elevated hover:text-text transition-colors"
                  key={account}
                  onClick={() => setUsername(account)}
                  type="button"
                >
                  {account}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-xs text-muted">
              Shared DEMO password: <span className="font-mono text-brand-light font-medium">{DEMO_PASSWORD}</span>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
