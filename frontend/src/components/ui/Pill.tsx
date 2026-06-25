// Small rounded label for metadata.
import type { HTMLAttributes } from 'react'
import { cn } from './utils'

export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-surface-input px-3 py-1 text-xs font-medium text-text-secondary',
        className,
      )}
      {...props}
    />
  )
}
