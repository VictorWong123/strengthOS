// Compact metric tile for dashboard and summary statistics.
import type { HTMLAttributes } from 'react'
import { cn } from './utils'

type MetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: string
  value: string
  detail?: string
  valueClassName?: string
}

export function MetricCard({ label, value, detail, className, valueClassName, ...props }: MetricCardProps) {
  return (
    <div className={cn('min-w-0 rounded-card bg-surface-input p-3', className)} {...props}>
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={cn('mt-1 truncate text-xl font-semibold', valueClassName)}>{value}</div>
      {detail ? <div className="mt-1 text-sm text-text-secondary">{detail}</div> : null}
    </div>
  )
}
