import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatTime } from '../utils/format.js'

function EventsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-navy-900 px-3 py-2 shadow-xl">
      <p className="text-[10px] text-slate-500">{formatTime(label, true)}</p>
      <p className="mt-1 text-xs font-semibold text-cyan-300">{payload[0].value} events</p>
    </div>
  )
}

export default function EventsChart({ data = [], height = 220 }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.09)" vertical={false} />
          <XAxis axisLine={false} dataKey="time" minTickGap={30} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(value) => formatTime(value)} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
          <Tooltip content={<EventsTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" fill="#22d3ee" maxBarSize={28} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
