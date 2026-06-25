// Sticky mobile page header with optional side actions and subtitle.
import type { ReactNode } from 'react'

type MobileHeaderProps = {
  title: ReactNode
  leftAction?: ReactNode
  rightAction?: ReactNode
  left?: ReactNode
  right?: ReactNode
  subtitle?: ReactNode
}

export function MobileHeader({ title, leftAction, rightAction, left, right, subtitle }: MobileHeaderProps) {
  const resolvedLeft = leftAction ?? left
  const resolvedRight = rightAction ?? right
  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-white/5 bg-black/90 px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top))] backdrop-blur md:-mx-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {resolvedLeft ? <div className="mb-3">{resolvedLeft}</div> : null}
          <div className="min-w-0">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-text-secondary">{subtitle}</div> : null}
        </div>
        {resolvedRight ? <div className="shrink-0">{resolvedRight}</div> : null}
      </div>
    </header>
  )
}
