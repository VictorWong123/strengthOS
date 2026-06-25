// Placeholder block for loading card content.
import { cn } from './utils'

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/10 motion-reduce:animate-none', className)} aria-hidden="true" />
}
