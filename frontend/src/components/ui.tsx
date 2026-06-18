import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'touch-target inline-flex items-center justify-center rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'touch-target inline-flex items-center justify-center rounded-lg bg-surface-elevated px-4 py-2 text-sm font-semibold text-gray-100 transition hover:bg-gray-700',
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'touch-target w-full rounded-lg border border-white/10 bg-surface-input px-3 py-2 text-white placeholder:text-gray-500 focus:border-accent-blue focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-white/10 bg-surface-card p-4 shadow-panel', className)}>
      {children}
    </section>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium text-gray-200', className)}>
      {children}
    </span>
  )
}
