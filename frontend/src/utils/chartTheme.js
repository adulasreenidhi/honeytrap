export const chartColors = {
  brand: '#f97316',
  brandLight: '#fb923c',
  brandDark: '#c2570c',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  text: '#f5ede4',
  muted: '#a8998a',
  faint: '#6f6254',
  border: '#2e2318',
  surface: '#14100c',
  surface2: '#1b150f',
}

export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: '#a8998a', fontSize: 10, fontFamily: 'Inter, sans-serif' },
}

export const gridProps = {
  stroke: 'rgba(46, 35, 24, 0.7)',
  vertical: false,
}

export const darkTooltipStyle = {
  wrapperStyle: { outline: 'none' },
  contentStyle: {
    backgroundColor: '#14100c',
    borderColor: '#2e2318',
    borderRadius: '0.75rem',
    padding: '8px 12px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 15px -3px rgba(249, 115, 22, 0.15)',
    color: '#f5ede4',
  },
  itemStyle: {
    color: '#fb923c',
    fontSize: '12px',
    fontWeight: 600,
  },
  labelStyle: {
    color: '#a8998a',
    fontSize: '10px',
    marginBottom: '4px',
  },
  cursor: { fill: 'rgba(249, 115, 22, 0.05)' },
}
