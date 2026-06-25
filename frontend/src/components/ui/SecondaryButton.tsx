// Secondary command button for alternate actions.
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

export function SecondaryButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button border border-white/10 bg-surface-input px-4 py-3 text-base font-semibold text-text-primary transition active:bg-surface-elevated disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        className,
      )}
      {...props}
    />
  )
}
