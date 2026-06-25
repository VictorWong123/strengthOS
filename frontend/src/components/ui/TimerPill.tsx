// Clock pill for displaying elapsed or remaining time.
import { Clock3 } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './utils'

type TimerPillProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function TimerPill({ children, className, ...props }: TimerPillProps) {
  return (
    <div className={cn('flex items-center gap-2 rounded-full bg-surface-card px-4 py-2 text-sm font-semibold', className)} {...props}>
      <Clock3 className="h-4 w-4 text-accent-blue" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
