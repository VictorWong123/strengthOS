// Full-width clock setting row with a label and current duration.
import { Clock3 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

type TimerSettingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  value: string
}

export function TimerSettingButton({ label, value, className, type = 'button', ...props }: TimerSettingButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card',
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-text-secondary">
        <Clock3 className="h-4 w-4 text-accent-blue" aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </button>
  )
}
