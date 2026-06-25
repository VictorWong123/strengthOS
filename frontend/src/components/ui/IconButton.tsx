// Circular icon-only button with surface, ghost, and danger variants.
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

export function IconButton({
  className,
  type = 'button',
  variant = 'surface',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'surface' | 'ghost' | 'danger' }) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-input text-text-primary transition active:bg-surface-elevated disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        variant === 'ghost' && 'border-transparent bg-transparent',
        variant === 'danger' && 'border-accent-danger/20 bg-surface-danger text-accent-danger',
        className,
      )}
      {...props}
    />
  )
}
