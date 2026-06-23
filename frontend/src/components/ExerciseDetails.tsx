import { X } from 'lucide-react'
import { bestCompletedSet, estimatedOneRepMax } from '../lib/performance'
import type { Exercise, WorkoutSet } from '../lib/types'
import { ExerciseMedia } from './ExerciseMedia'
import { Badge, IconButton, PrimaryButton, SecondaryButton, SurfaceCard } from './ui'

type Props = {
  exercise: Exercise
  sets: WorkoutSet[]
  open?: boolean
  onClose: () => void
  onAddToWorkout: () => void
  onAddToRoutine: () => void
}

export function ExerciseDetails({ exercise, sets, open = true, onClose, onAddToWorkout, onAddToRoutine }: Props) {
  const bestSet = bestCompletedSet(sets)
  const bestE1rm = bestSet ? estimatedOneRepMax(bestSet) : null

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-overlay p-4 pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true">
      <SurfaceCard className="mx-auto max-w-app space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold">{exercise.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
              {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
              {exercise.secondary_muscles.map((muscle) => (
                <Badge key={muscle}>{muscle}</Badge>
              ))}
            </div>
          </div>
          <IconButton aria-label="Close exercise details" variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
        <div className="overflow-hidden rounded-card border border-app-border bg-surface-elevated">
          <ExerciseMedia
            src={exercise.animation_url ?? exercise.image_url}
            alt={`${exercise.name} demonstration`}
            controls
            className="max-h-96 w-full object-contain"
            videoClassName="max-h-96 w-full bg-black object-contain"
            fallback={<div className="flex h-48 items-center justify-center text-sm text-zinc-500">No provider media available.</div>}
          />
        </div>
        <div>
          <h3 className="font-semibold">Instructions</h3>
          {exercise.instructions.length ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
              {exercise.instructions.map((step, index) => (
                <li key={`${exercise.id}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No instructions are available for this exercise.</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Sets" value={String(sets.length)} />
          <Metric label="Best" value={bestSet ? `${bestSet.weight} x ${bestSet.reps}` : '-'} />
          <Metric label="1RM" value={bestE1rm ? `${bestE1rm}` : '-'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PrimaryButton onClick={onAddToWorkout}>Add to Workout</PrimaryButton>
          <SecondaryButton onClick={onAddToRoutine}>Add to Routine</SecondaryButton>
        </div>
      </SurfaceCard>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-button bg-surface-elevated p-3">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
    </div>
  )
}
