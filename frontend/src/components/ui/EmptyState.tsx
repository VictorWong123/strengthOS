// Centered empty state for screens or sections with no data.
import type { ReactNode } from 'react'
import { SurfaceCard } from './SurfaceCard'
import { renderStateIcon, type StateIcon } from './stateIcon'

type EmptyStateProps = {
  icon: StateIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <SurfaceCard className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-input">
        {renderStateIcon(icon, 'h-6 w-6 text-text-secondary')}
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      {action}
    </SurfaceCard>
  )
}
