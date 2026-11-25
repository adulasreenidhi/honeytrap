import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatTime } from '../utils/format.js'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-navy-900 px-3 py-2 shadow-xl">
      <p className="text-[10px] text-slate-500">{formatTime(label, true)}</p>
      <p className="mt-1 text-xs font-semibold text-blue-300">Trust {payload[0].value}</p>
    </div>
  )
}

export default function TrustTrendChart({ data = [], threshold, variant = 'area', height = 240 }) {
  const Chart = variant === 'line' ? LineChart : AreaChart
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trustFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.09)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="time"
            minTickGap={30}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={(value) => formatTime(value)}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip content={<ChartTooltip />} />
          {Number.isFinite(Number(threshold)) && (
            <ReferenceLine
              y={Number(threshold)}
              label={{ value: `Restrict ${threshold}`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
              stroke="#f59e0b"
              strokeDasharray="4 4"
            />
          )}
          {variant === 'line' ? (
            <Line dataKey="score" dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }} isAnimationActive={false} name="Trust" stroke="#60a5fa" strokeWidth={2} type="monotone" />
          ) : (
            <Area dataKey="value" dot={false} isAnimationActive={false} name="Trust" stroke="#60a5fa" strokeWidth={2} type="monotone" fill="url(#trustFill)" />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
