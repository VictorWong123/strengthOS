// Styled multiline input for app forms.
import type { TextareaHTMLAttributes } from 'react'
import { cn } from './utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[120px] w-full rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
