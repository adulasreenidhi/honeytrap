import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { verifyOtp } from '../api/client.js'
import useAuth from '../context/useAuth.js'
import DecisionBanner from '../components/DecisionBanner.jsx'
import { notify } from '../utils/notify.js'

export default function ResourceViewer({ resource, result, title, disabled }) {
  const { refreshMe } = useAuth()
  const [isVerifyOpen, setIsVerifyOpen] = useState(false)
  const [otp, setOtp] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState('')

  async function handleVerify(event) {
    event.preventDefault()
    setIsVerifying(true)
    setVerificationMessage('')
    try {
      const response = await verifyOtp(otp)
      const verification = response.ok === false ? response.decision : response
      await refreshMe()
      const message = verification.verified
        ? `Identity verified. Decision: ${verification.decision}. Trust score: ${verification.trust_score ?? 'updated'}.`
        : `Identity verification was not completed.${verification.reasons?.length ? ` ${verification.reasons.join(' ')}` : ''}`
      setVerificationMessage(message)
      notify(message, verification.verified ? 'success' : 'info')
      setOtp('')
      setIsVerifyOpen(false)
    } catch (error) {
      const message = error.detail || error.error || 'Unable to verify identity.'
      setVerificationMessage(message)
      notify(message, 'error')
    } finally {
      setIsVerifying(false)
    }
  }

  if (!resource && !result) return null

  return (
    <div className="space-y-4">
      {resource && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">RESOURCE VIEWER</p>
            <h2 className="mt-2 break-all text-lg font-bold text-text">{resource.name}</h2>
            <p className="mt-1 text-xs text-muted">{resource.department} · {resource.type}</p>
          </div>
          <KeyRound size={18} className="mt-1 shrink-0 text-faint" aria-hidden="true" />
        </div>
      )}
      {!resource && title && (
        <div>
          <p className="eyebrow">SEARCH DECISION</p>
          <h2 className="mt-2 text-lg font-bold text-text">{title}</h2>
        </div>
      )}
      <DecisionBanner
        result={result}
        onVerify={() => setIsVerifyOpen(true)}
        verifyDisabled={disabled}
      />
      {verificationMessage && (
        <p className="rounded-xl border border-border bg-surface-2/70 px-4 py-3 text-sm text-text" role="status">
          {verificationMessage}
        </p>
      )}

      {isVerifyOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isVerifying) setIsVerifyOpen(false)
          }}
        >
          <section
            aria-labelledby="verify-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl ring-1 ring-border-glow"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">STEP-UP VERIFICATION</p>
                <h2 className="mt-2 text-lg font-bold text-text" id="verify-title">Verify your identity</h2>
              </div>
              <button
                type="button"
                aria-label="Close verification dialog"
                className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text transition-colors"
                disabled={isVerifying}
                onClick={() => setIsVerifyOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Enter the simulated one-time code to request a fresh trust assessment.
            </p>
            <form className="mt-5 space-y-4" onSubmit={handleVerify}>
              <div>
                <label className="field-label" htmlFor="otp">One-time code</label>
                <input
                  autoComplete="one-time-code"
                  className="input text-field mt-2 font-mono tracking-[0.3em]"
                  disabled={disabled || isVerifying}
                  id="otp"
                  inputMode="numeric"
                  maxLength={12}
                  onChange={(event) => setOtp(event.target.value)}
                  required
                  value={otp}
                />
              </div>
              <button
                className="btn-primary button-primary w-full shadow-glow-sm"
                disabled={disabled || isVerifying || !otp.trim()}
                type="submit"
              >
                {isVerifying ? 'Verifying…' : 'Verify identity'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
