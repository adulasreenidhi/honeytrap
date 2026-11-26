export default function StatCard({ label, value, note, icon: Icon }) {
  return (
    <div className="card flex items-start justify-between gap-4 p-5 transition-all duration-200 hover:border-brand/40 hover:shadow-glow-sm group">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-text tabular-nums">{value}</p>
        {note && <p className="mt-1 text-xs text-faint">{note}</p>}
      </div>
      {Icon && (
        <span className="rounded-xl border border-brand/25 bg-brand/10 p-2.5 text-brand shadow-sm transition-colors group-hover:bg-brand/15 group-hover:border-brand/40 group-hover:text-brand-light">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
