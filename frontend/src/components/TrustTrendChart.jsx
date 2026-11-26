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
import { axisProps, gridProps } from '../utils/chartTheme.js'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl ring-1 ring-border-glow shadow-glow-sm">
      <p className="text-[10px] text-muted">{formatTime(label, true)}</p>
      <p className="mt-1 text-xs font-bold text-brand-light tabular-nums">Trust {payload[0].value}</p>
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
            <linearGradient id="trustFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
              <stop offset="70%" stopColor="#ea580c" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#c2570c" stopOpacity={0.0} />
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
            domain={[0, 100]}
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
            <Line dataKey="score" dot={{ r: 3, fill: '#fb923c', strokeWidth: 0 }} isAnimationActive={false} name="Trust" stroke="#f97316" strokeWidth={2.5} type="monotone" />
          ) : (
            <Area dataKey="value" dot={false} isAnimationActive={false} name="Trust" stroke="#f97316" strokeWidth={2.5} type="monotone" fill="url(#trustFill)" />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
