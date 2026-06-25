// Primary command button for the main action in a surface.
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

export function PrimaryButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button bg-accent-blue px-4 py-3 text-base font-semibold text-white transition active:bg-accent-pressed disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        className,
      )}
      {...props}
    />
  )
}
