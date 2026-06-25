// Standard elevated card surface for grouped content.
import type { HTMLAttributes } from 'react'
import { cn } from './utils'

export function SurfaceCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-card border border-white/10 bg-surface-card p-4 shadow-panel', className)} {...props} />
}
