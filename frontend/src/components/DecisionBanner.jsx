import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'

const decisions = {
  ALLOW: {
    title: 'Access allowed',
    icon: CheckCircle2,
    styles: 'border-success/30 bg-success/[0.06] text-success border-l-4 border-l-success',
  },
  RESTRICT: {
    title: 'Additional verification required',
    icon: AlertTriangle,
    styles: 'border-warning/30 bg-warning/[0.06] text-warning border-l-4 border-l-warning',
  },
  DENY: {
    title: 'Access denied',
    icon: ShieldAlert,
    styles: 'border-danger/30 bg-danger/[0.06] text-danger border-l-4 border-l-danger',
  },
}

export default function DecisionBanner({ result, onVerify, verifyDisabled = false }) {
  if (!result) return null
  const decision = String(result.decision || '').toUpperCase()
  const config = decisions[decision] || decisions.DENY
  const Icon = config.icon

  return (
    <section className={`rounded-xl border p-4 sm:p-5 shadow-lg backdrop-blur-sm ${config.styles}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-bold tracking-tight text-text">{config.title}</h3>
            <p className="mt-1 text-xs text-muted">
              Policy decision · Trust score <span className="font-semibold text-text">{result.trust_score ?? '—'}</span>
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

      <details className="decision-details mt-4 border-t border-border/60 pt-3" open>
        <summary className="hover:text-brand transition-colors">Why was this decided?</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Reasons</p>
            {result.reasons?.length ? (
              <ul className="mt-2 space-y-1.5">
                {result.reasons.map((reason, index) => (
                  <li className="text-xs leading-5 text-text" key={`${index}-${reason}`}>{reason}</li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-faint">No reasons supplied.</p>}
          </div>
          <div className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Triggered rules</p>
            {result.triggered_rules?.length ? (
              <ul className="mt-2 space-y-1.5">
                {result.triggered_rules.map((rule) => (
                  <li className="font-mono text-xs text-brand-light" key={rule}>{rule}</li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-faint">No rules triggered.</p>}
          </div>
        </div>
      </details>

      {decision === 'ALLOW' && result.content && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2/80 p-4 shadow-inner">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Resource content</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text font-mono">{result.content}</p>
        </div>
      )}
    </section>
  )
}
