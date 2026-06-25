// Styled select input for app forms.
import type { SelectHTMLAttributes } from 'react'
import { cn } from './utils'

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-base text-text-primary focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
