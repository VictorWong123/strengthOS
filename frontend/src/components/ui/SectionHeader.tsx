// Section title row with optional count, subtitle, and action.
import type { ReactNode } from 'react'

type SectionHeaderProps = {
  title: string
  count?: number
  subtitle?: string
  action?: ReactNode
}

export function SectionHeader({ title, count, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {title}
          {typeof count === 'number' ? <span className="ml-2 text-base text-text-muted">{count}</span> : null}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
