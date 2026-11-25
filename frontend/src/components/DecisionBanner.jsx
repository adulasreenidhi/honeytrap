import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'

const decisions = {
  ALLOW: {
    title: 'Access allowed',
    icon: CheckCircle2,
    styles: 'border-allow/25 bg-allow/[0.06] text-allow',
  },
  RESTRICT: {
    title: 'Additional verification required',
    icon: AlertTriangle,
    styles: 'border-warning/25 bg-warning/[0.06] text-warning',
  },
  DENY: {
    title: 'Access denied',
    icon: ShieldAlert,
    styles: 'border-critical/25 bg-critical/[0.06] text-critical',
  },
}

export default function DecisionBanner({ result, onVerify, verifyDisabled = false }) {
  if (!result) return null
  const decision = String(result.decision || '').toUpperCase()
  const config = decisions[decision] || decisions.DENY
  const Icon = config.icon

  return (
    <section className={`rounded-xl border p-4 sm:p-5 ${config.styles}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-semibold">{config.title}</h3>
            <p className="mt-1 text-xs text-slate-400">
              Policy decision · Trust score {result.trust_score ?? '—'}
            </p>
          </div>
        </div>
        {decision === 'RESTRICT' && onVerify && (
          <button
            type="button"
            className="button-warning shrink-0"
            onClick={onVerify}
            disabled={verifyDisabled}
          >
            Verify identity
          </button>
        )}
      </div>

      <details className="decision-details mt-4" open>
        <summary>Why was this decided?</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">Reasons</p>
            {result.reasons?.length ? (
              <ul className="mt-2 space-y-1.5">
                {result.reasons.map((reason, index) => (
                  <li className="text-xs leading-5 text-slate-300" key={`${index}-${reason}`}>{reason}</li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-slate-500">No reasons supplied.</p>}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">Triggered rules</p>
            {result.triggered_rules?.length ? (
              <ul className="mt-2 space-y-1.5">
                {result.triggered_rules.map((rule) => (
                  <li className="font-mono text-xs text-slate-300" key={rule}>{rule}</li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-slate-500">No rules triggered.</p>}
          </div>
        </div>
      </details>

      {decision === 'ALLOW' && result.content && (
        <div className="mt-4 rounded-lg border border-white/5 bg-black/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">Resource content</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{result.content}</p>
        </div>
      )}
    </section>
  )
}
