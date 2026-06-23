type TrendChartProps = {
  title: string
  unit: string
  data: Array<{ label: string; value: number }>
  tone: 'blue' | 'green'
}

const CHART_WIDTH = 640
const CHART_HEIGHT = 220
const CHART_PADDING = 28

export function TrendChart({ title, unit, data, tone }: TrendChartProps) {
  const maxValue = Math.max(...data.map((point) => point.value), 0)
  const points = data.map((point, index) => {
    const usableWidth = CHART_WIDTH - CHART_PADDING * 2
    const usableHeight = CHART_HEIGHT - CHART_PADDING * 2
    const x = data.length <= 1 ? CHART_WIDTH / 2 : CHART_PADDING + (index / (data.length - 1)) * usableWidth
    const y = maxValue <= 0 ? CHART_HEIGHT - CHART_PADDING : CHART_HEIGHT - CHART_PADDING - (point.value / maxValue) * usableHeight
    return { ...point, x, y }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const stroke = tone === 'blue' ? '#0A84FF' : '#30D158'

  return (
    <div className="rounded-card border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-sm text-text-secondary">{maxValue ? `${formatNumber(maxValue)} ${unit}` : `0 ${unit}`}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl bg-surface-input">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${title} over time`} className="h-[190px] w-full">
          <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(255,255,255,0.18)" />
          <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="rgba(255,255,255,0.18)" />
          {path ? <path d={path} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {points.map((point) => (
            <circle key={`${point.label}-${point.value}`} cx={point.x} cy={point.y} r="5" fill={stroke}>
              <title>{`${point.label}: ${formatNumber(point.value)} ${unit}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-xs text-text-muted">
        <span>{data[0]?.label ?? 'No data'}</span>
        <span>{data[data.length - 1]?.label ?? 'No data'}</span>
      </div>
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
