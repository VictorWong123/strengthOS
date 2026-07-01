import { Plus } from 'lucide-react'
import type { Exercise, WorkoutSet } from '../../lib/types'
import { ExerciseSummary } from '../ExerciseSummary'
import { IconButton, SecondaryButton, SurfaceCard, TimerIconButton } from '../ui'
import { WorkoutSetRow } from './WorkoutSetRow'
import { formatPreviousSet, formatRestDuration } from './workoutSummary'

type ActiveWorkoutExerciseCardProps = {
  exercise: Exercise | null
  sets: WorkoutSet[]
  previousSets: WorkoutSet[]
  onAddSet: () => void
  workoutRestSeconds: number
  restSecondsOverride: number | null
  onStartRestTimer: (seconds: number) => void
  onChangeRestSeconds: () => void
  onOpenDetails: () => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
}

export function ActiveWorkoutExerciseCard({
  exercise,
  sets,
  previousSets,
  onAddSet,
  workoutRestSeconds,
  restSecondsOverride,
  onStartRestTimer,
  onChangeRestSeconds,
  onOpenDetails,
  onUpdateSet,
  onDeleteSet,
}: ActiveWorkoutExerciseCardProps) {
  const effectiveRestSeconds = restSecondsOverride ?? workoutRestSeconds

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        {exercise ? (
          <ExerciseSummary
            className="min-w-0 flex-1"
            exercise={exercise}
            detail={previousSets.length ? `Previous: ${formatPreviousSet(previousSets[0])}` : 'No previous performance yet'}
            onOpenDetails={() => onOpenDetails()}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-semibold">Exercise</h3>
            <p className="mt-1 text-sm text-text-secondary">No equipment</p>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <TimerIconButton
            label={`Set rest for ${exercise?.name ?? 'exercise'} (${formatRestDuration(effectiveRestSeconds)})`}
            onClick={onChangeRestSeconds}
          />
          <IconButton aria-label={`Add set to ${exercise?.name ?? 'exercise'}`} onClick={onAddSet}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        <span>Set</span>
        <span>Previous</span>
        <span>Weight</span>
        <span>Reps</span>
        <span>Done</span>
      </div>

      <div className="space-y-2">
        {sets.map((set, index) => (
          <WorkoutSetRow
            key={set.id}
            set={set}
            previousSet={previousSets[index] ?? null}
            onUpdateSet={onUpdateSet}
            onDeleteSet={onDeleteSet}
            onCompleteSet={() => onStartRestTimer(effectiveRestSeconds)}
          />
        ))}
      </div>

      <div className="flex">
        <SecondaryButton className="flex-1" onClick={onAddSet}>
          Add Set
        </SecondaryButton>
      </div>
    </SurfaceCard>
  )
}
