export default function TrustGauge({ score }) {
  const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0
  const color = safeScore > 70 ? '#22c55e' : safeScore > 40 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 17
  const offset = circumference * (1 - safeScore / 100)

  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={`Session trust score ${safeScore} out of 100`}>
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" stroke="#1e293b" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Trust</p>
        <p className="font-mono text-sm font-semibold text-white">{safeScore}<span className="text-slate-500">/100</span></p>
      </div>
    </div>
  )
}
