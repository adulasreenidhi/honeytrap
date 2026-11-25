const styles = {
  low: 'bg-slate-500/10 text-slate-400 ring-slate-500/20',
  medium: 'bg-warning/10 text-amber-300 ring-warning/20',
  high: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  critical: 'bg-critical/10 text-red-300 ring-critical/20',
}

export default function SeverityBadge({ value = 'low' }) {
  const normalized = String(value).toLowerCase()
  const style = styles[normalized] || styles.low
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${style}`}>
      {normalized}
    </span>
  )
}
