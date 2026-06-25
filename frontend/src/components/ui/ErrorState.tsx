// Error state surface with optional retry/action control.
import type { ReactNode } from 'react'
import { PrimaryButton } from './PrimaryButton'
import { SurfaceCard } from './SurfaceCard'
import { renderStateIcon, type StateIcon } from './stateIcon'

type ErrorStateProps = {
  icon: StateIcon
  title: string
  description: string
  action?: ReactNode
  message?: string
  onRetry?: () => void
}

export function ErrorState({ icon, title, description, action, message, onRetry }: ErrorStateProps) {
  const resolvedTitle = title ?? 'Something went wrong'
  const resolvedDescription = description ?? message ?? 'Try again.'
  return (
    <SurfaceCard className="border-accent-danger/20 bg-surface-danger">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-danger/15">
          {renderStateIcon(icon, 'h-5 w-5 text-accent-danger')}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{resolvedTitle}</h3>
          <p className="mt-1 text-sm text-text-secondary">{resolvedDescription}</p>
          {action ? <div className="mt-4">{action}</div> : null}
          {onRetry ? <PrimaryButton className="mt-4 w-full" onClick={onRetry}>Retry</PrimaryButton> : null}
        </div>
      </div>
    </SurfaceCard>
  )
}
