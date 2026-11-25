export default function StatCard({ label, value, note, icon: Icon }) {
  return (
    <div className="surface flex items-start justify-between gap-4 p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      {Icon && (
        <span className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
