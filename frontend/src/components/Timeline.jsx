import { Activity, ArrowDownUp, Clock3, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import SeverityBadge from './SeverityBadge.jsx'
import { formatTime } from '../utils/format.js'

const kindConfig = {
  activity: { icon: Activity, color: 'text-info', label: 'Activity' },
  trust_change: { icon: ArrowDownUp, color: 'text-warning', label: 'Trust change' },
  decision: { icon: ShieldCheck, color: 'text-brand', label: 'Decision' },
  response_action: { icon: Siren, color: 'text-brand-light', label: 'Response action' },
  device_context: { icon: Clock3, color: 'text-muted', label: 'Session context' },
}

export default function Timeline({ items = [] }) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-muted">No timeline events are available.</p>
  }
  return (
    <ol className="relative ml-3 border-l border-border">
      {items.map((item, index) => {
        const config = kindConfig[item.kind] || { icon: ShieldAlert, color: 'text-muted', label: item.kind || 'Event' }
        const Icon = config.icon
        return (
          <li className="relative pb-7 pl-7 last:pb-0" key={`${item.time || 'time'}-${item.kind}-${index}`}>
            <span className={`absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 ${config.color} shadow-sm`}>
              <Icon size={12} aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{config.label}</span>
              {item.severity && <SeverityBadge value={item.severity} />}
              <time className="ml-auto text-[10px] text-faint tabular-nums">{formatTime(item.time, true)}</time>
            </div>
            <TimelineContent item={item} />
          </li>
        )
      })}
    </ol>
  )
}

function TimelineContent({ item }) {
  if (item.kind === 'activity') {
    return (
      <>
        <p className="mt-1.5 text-sm font-semibold text-text">{String(item.event_type || 'Activity').replaceAll('_', ' ')}</p>
        {item.resource_id !== null && item.resource_id !== undefined && <p className="mt-1 text-xs text-muted">Resource ID <span className="font-mono text-brand-light">{item.resource_id}</span></p>}
      </>
    )
  }
  if (item.kind === 'trust_change') {
    return (
      <>
        <p className="mt-1.5 text-sm font-semibold text-text">Trust score <span className="tabular-nums">{item.score}</span></p>
        <p className="mt-1 text-xs text-muted">Change {Number(item.delta) > 0 ? '+' : ''}{item.delta} · {item.reason}</p>
      </>
    )
  }
  if (item.kind === 'decision') {
    return (
      <>
        <p className="mt-1.5 text-sm font-semibold text-text">Decision: <span className="text-brand-light font-bold">{item.decision}</span> · trust {item.trust_score}</p>
        {item.reasons?.length > 0 && <p className="mt-1 text-xs leading-5 text-muted">{item.reasons.join(' · ')}</p>}
        {item.triggered_rules?.length > 0 && <p className="mt-1 font-mono text-[10px] text-faint">{item.triggered_rules.join(', ')}</p>}
      </>
    )
  }
  if (item.kind === 'response_action') {
    return (
      <>
        <p className="mt-1.5 text-sm font-semibold text-text">{String(item.action || '').replaceAll('_', ' ')}</p>
        {item.notes && <p className="mt-1 text-xs text-muted">{item.notes}</p>}
      </>
    )
  }
  return (
    <>
      <p className="mt-1.5 text-sm font-semibold text-text">Session context updated</p>
      <p className="mt-1 text-xs text-muted">{item.device_id} · {item.location} · {item.session_status}</p>
    </>
  )
}
