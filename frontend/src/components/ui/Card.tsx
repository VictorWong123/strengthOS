// Backward-compatible alias for the standard surface card.
import type { HTMLAttributes } from 'react'
import { SurfaceCard } from './SurfaceCard'

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <SurfaceCard className={className} {...props} />
}
