// Compact clock button for opening timer or rest controls.
import { Clock3 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

type TimerIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
}

export function TimerIconButton({ label, className, type = 'button', ...props }: TimerIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-input text-text-secondary transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
        className,
      )}
      {...props}
    >
      <Clock3 className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
