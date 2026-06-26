import type { ReactNode } from 'react'
import type { Exercise } from '../lib/types'
import { ExerciseMedia } from './ExerciseMedia'
import { Badge, cn } from './ui'

type ExerciseSummaryProps = {
  exercise: Exercise
  detail?: ReactNode
  action?: ReactNode
  className?: string
  onOpenDetails: (exercise: Exercise) => void
}

export function ExerciseSummary({ exercise, detail, action, className, onOpenDetails }: ExerciseSummaryProps) {
  return (
    <div className={cn('flex min-h-[72px] items-center gap-3', className)}>
      <ExerciseThumbnail exercise={exercise} onOpenDetails={onOpenDetails} />
      <button
        type="button"
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
        onClick={() => onOpenDetails(exercise)}
      >
        <span className="block truncate font-semibold text-white">{exercise.name}</span>
        <span className="mt-1 flex flex-wrap gap-2">
          {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
          <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
        </span>
        {detail ? <span className="mt-2 block text-xs text-text-muted">{detail}</span> : null}
      </button>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function ExerciseThumbnail({ exercise, onOpenDetails }: { exercise: Exercise; onOpenDetails: (exercise: Exercise) => void }) {
  return (
    <button
      type="button"
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-elevated text-[10px] text-zinc-500"
      onClick={() => onOpenDetails(exercise)}
      aria-label={`Open ${exercise.name} details`}
    >
      <ExerciseMedia
        src={exercise.thumbnail_url}
        alt={`${exercise.name} thumbnail`}
        decoding="async"
        className="h-full w-full object-cover"
        fallback="No media"
      />
    </button>
  )
}
