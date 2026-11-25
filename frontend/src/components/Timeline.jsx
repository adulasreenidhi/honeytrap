import { Activity, ArrowDownUp, Clock3, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import SeverityBadge from './SeverityBadge.jsx'
import { formatTime } from '../utils/format.js'

const kindConfig = {
  activity: { icon: Activity, color: 'text-blue-300', label: 'Activity' },
  trust_change: { icon: ArrowDownUp, color: 'text-amber-300', label: 'Trust change' },
  decision: { icon: ShieldCheck, color: 'text-cyan-300', label: 'Decision' },
  response_action: { icon: Siren, color: 'text-orange-300', label: 'Response action' },
  device_context: { icon: Clock3, color: 'text-slate-400', label: 'Session context' },
}

export default function Timeline({ items = [] }) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No timeline events are available.</p>
  }
  return (
    <ol className="relative ml-3 border-l border-white/[0.08]">
      {items.map((item, index) => {
        const config = kindConfig[item.kind] || { icon: ShieldAlert, color: 'text-slate-400', label: item.kind || 'Event' }
        const Icon = config.icon
        return (
          <li className="relative pb-7 pl-7 last:pb-0" key={`${item.time || 'time'}-${item.kind}-${index}`}>
            <span className={`absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-navy-900 ${config.color}`}>
              <Icon size={12} aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{config.label}</span>
              {item.severity && <SeverityBadge value={item.severity} />}
              <time className="ml-auto text-[10px] text-slate-600">{formatTime(item.time, true)}</time>
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
        <p className="mt-1.5 text-sm font-medium text-slate-200">{String(item.event_type || 'Activity').replaceAll('_', ' ')}</p>
        {item.resource_id !== null && item.resource_id !== undefined && <p className="mt-1 text-xs text-slate-500">Resource ID {item.resource_id}</p>}
      </>
    )
  }
  if (item.kind === 'trust_change') {
    return (
      <>
        <p className="mt-1.5 text-sm font-medium text-slate-200">Trust score {item.score}</p>
        <p className="mt-1 text-xs text-slate-500">Change {Number(item.delta) > 0 ? '+' : ''}{item.delta} · {item.reason}</p>
      </>
    )
  }
  if (item.kind === 'decision') {
    return (
      <>
        <p className="mt-1.5 text-sm font-medium text-slate-200">Decision: {item.decision} · trust {item.trust_score}</p>
        {item.reasons?.length > 0 && <p className="mt-1 text-xs leading-5 text-slate-500">{item.reasons.join(' · ')}</p>}
        {item.triggered_rules?.length > 0 && <p className="mt-1 font-mono text-[10px] text-slate-600">{item.triggered_rules.join(', ')}</p>}
      </>
    )
  }
  if (item.kind === 'response_action') {
    return (
      <>
        <p className="mt-1.5 text-sm font-medium text-slate-200">{String(item.action || '').replaceAll('_', ' ')}</p>
        {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
      </>
    )
  }
  return (
    <>
      <p className="mt-1.5 text-sm font-medium text-slate-200">Session context updated</p>
      <p className="mt-1 text-xs text-slate-500">{item.device_id} · {item.location} · {item.session_status}</p>
    </>
  )
}
