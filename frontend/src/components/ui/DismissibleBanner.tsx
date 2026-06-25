// Inline status banner with optional icon and dismiss action.
import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from './IconButton'
import { cn } from './utils'

type Tone = 'default' | 'warning' | 'danger' | 'success'

type BannerProps = {
  icon?: LucideIcon
  tone?: Tone
  children: ReactNode
  onDismiss?: () => void
}

export function DismissibleBanner({ icon: Icon, tone = 'warning', children, onDismiss }: BannerProps) {
  const toneClass = {
    default: 'bg-surface-input text-text-primary',
    warning: 'bg-surface-warning text-text-primary',
    danger: 'bg-surface-danger text-text-primary',
    success: 'bg-surface-success text-text-primary',
  }[tone]

  return (
    <div className={cn('flex items-start gap-3 rounded-card border border-white/10 px-4 py-3', toneClass)}>
      {Icon ? <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {onDismiss ? (
        <IconButton aria-label="Dismiss message" className="h-9 w-9 border-0 bg-black/10" onClick={onDismiss}>
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  )
}
