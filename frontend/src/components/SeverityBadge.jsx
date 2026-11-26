const styles = {
  low: 'border-info/30 bg-info/10 text-info',
  medium: 'border-warning/30 bg-warning/10 text-warning',
  high: 'border-brand/35 bg-brand/10 text-brand-light',
  critical: 'border-danger/30 bg-danger/10 text-danger',
  open: 'border-danger/30 bg-danger/10 text-danger',
  investigating: 'border-warning/30 bg-warning/10 text-warning',
  resolved: 'border-success/30 bg-success/10 text-success',
  allowed: 'border-success/30 bg-success/10 text-success',
  active: 'border-success/30 bg-success/10 text-success',
  restricted: 'border-warning/30 bg-warning/10 text-warning',
  denied: 'border-danger/30 bg-danger/10 text-danger',
}

export default function SeverityBadge({ value = 'low' }) {
  const normalized = String(value).toLowerCase()
  const style = styles[normalized] || styles.low
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style}`}>
      {normalized}
    </span>
  )
}
