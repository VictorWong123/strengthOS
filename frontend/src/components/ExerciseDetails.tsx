import { useState } from 'react'
import type { Exercise, WorkoutSet } from '../lib/types'
import { bestCompletedSet, estimatedOneRepMax } from '../lib/performance'
import { Badge, Button, Card, GhostButton } from './ui'

type Props = {
  exercise: Exercise
  sets: WorkoutSet[]
  onClose: () => void
  onAddToWorkout: () => void
  onAddToRoutine: () => void
}

export function ExerciseDetails({ exercise, sets, onClose, onAddToWorkout, onAddToRoutine }: Props) {
  const bestSet = bestCompletedSet(sets)
  const bestE1rm = bestSet ? estimatedOneRepMax(bestSet) : null
  const [mediaFailed, setMediaFailed] = useState(false)
  const mediaUrl = mediaFailed ? null : exercise.animation_url ?? exercise.image_url
  const isVideo = Boolean(mediaUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(mediaUrl))

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Card className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{exercise.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
              {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
              {exercise.secondary_muscles.map((muscle) => (
                <Badge key={muscle}>{muscle}</Badge>
              ))}
            </div>
          </div>
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-surface-input">
          {mediaUrl ? (
            isVideo ? (
              <video
                src={mediaUrl}
                controls
                preload="metadata"
                onError={() => setMediaFailed(true)}
                className="max-h-96 w-full bg-black object-contain"
                aria-label={`${exercise.name} demonstration`}
              />
            ) : (
              <img
                src={mediaUrl}
                alt={`${exercise.name} demonstration`}
                loading="lazy"
                onError={() => setMediaFailed(true)}
                className="max-h-96 w-full object-contain"
              />
            )
          ) : (
            <div className="flex h-48 items-center justify-center text-gray-500">No provider media available.</div>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Instructions</h3>
          {exercise.instructions.length ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-gray-300">
              {exercise.instructions.map((step, index) => (
                <li key={`${exercise.id}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-gray-400">No instructions are available for this exercise.</p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Recent sets" value={String(sets.length)} />
          <Metric label="Best set" value={bestSet ? `${bestSet.weight} x ${bestSet.reps}` : 'None'} />
          <Metric label="Est. 1RM" value={bestE1rm ? `${bestE1rm}` : 'None'} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={onAddToWorkout}>Add to workout</Button>
          <GhostButton onClick={onAddToRoutine}>Add to routine</GhostButton>
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-input p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
