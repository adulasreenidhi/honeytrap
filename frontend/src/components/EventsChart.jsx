import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatTime } from '../utils/format.js'
import { axisProps, gridProps } from '../utils/chartTheme.js'

function EventsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl ring-1 ring-border-glow shadow-glow-sm">
      <p className="text-[10px] text-muted">{formatTime(label, true)}</p>
      <p className="mt-1 text-xs font-bold text-brand-light tabular-nums">{payload[0].value} events</p>
    </div>
  )
}

export default function EventsChart({ data = [], height = 220 }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridProps.stroke} vertical={gridProps.vertical} />
          <XAxis
            {...axisProps}
            dataKey="time"
            minTickGap={30}
            tickFormatter={(value) => formatTime(value)}
          />
          <YAxis
            {...axisProps}
            allowDecimals={false}
          />
          <Tooltip content={<EventsTooltip />} cursor={{ fill: 'rgba(249,115,22,0.06)' }} />
          <Bar dataKey="value" fill="url(#barGrad)" maxBarSize={28} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
