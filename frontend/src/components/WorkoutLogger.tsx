import { Check, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { Button, Card, GhostButton, Input } from './ui'

type Props = {
  workout: Workout | null
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  onCreateWorkout: () => void
  onAddSet: (workoutExerciseId: string) => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
}

export function WorkoutLogger({
  workout,
  workoutExercises,
  sets,
  exerciseById,
  onCreateWorkout,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
}: Props) {
  const setsByWorkoutExercise = useMemo(() => {
    const grouped = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      grouped.set(set.workout_exercise_id, [...(grouped.get(set.workout_exercise_id) ?? []), set])
    }
    return grouped
  }, [sets])

  if (!workout) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Active workout</h2>
          <p className="text-sm text-gray-400">Start a workout, then add exercises from the picker.</p>
        </div>
        <Button onClick={onCreateWorkout}>Start workout</Button>
      </Card>
    )
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{workout.name}</h2>
        <p className="text-sm text-gray-400">Large tap targets and clear completed-set states.</p>
      </div>
      <div className="space-y-4">
        {workoutExercises.map((item) => {
          const exercise = exerciseById.get(item.exercise_id)
          const itemSets = setsByWorkoutExercise.get(item.id) ?? []
          return (
            <section key={item.id} className="rounded-lg bg-surface-input p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{exercise?.name ?? 'Exercise'}</h3>
                  <p className="text-sm text-gray-400">{exercise?.equipment ?? 'No equipment'}</p>
                </div>
                <GhostButton onClick={() => onAddSet(item.id)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Set
                </GhostButton>
              </div>
              <div className="mt-3 space-y-2">
                {itemSets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    onUpdateSet={onUpdateSet}
                    onDeleteSet={onDeleteSet}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Card>
  )
}

function SetRow({
  set,
  onUpdateSet,
  onDeleteSet,
}: {
  set: WorkoutSet
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
}) {
  const [weightDraft, setWeightDraft] = useState(formatSetValue(set.weight))
  const [repsDraft, setRepsDraft] = useState(formatSetValue(set.reps))

  useEffect(() => {
    setWeightDraft(formatSetValue(set.weight))
    setRepsDraft(formatSetValue(set.reps))
  }, [set.weight, set.reps])

  function commitNumber(field: 'weight' | 'reps', draft: string) {
    const currentValue = field === 'weight' ? set.weight : set.reps
    const currentDraft = formatSetValue(currentValue)
    const trimmed = draft.trim()

    if (trimmed === currentDraft) return
    if (!trimmed) {
      onUpdateSet(set, { [field]: null })
      return
    }

    const nextValue = Number(trimmed)
    if (!Number.isFinite(nextValue)) {
      if (field === 'weight') setWeightDraft(currentDraft)
      else setRepsDraft(currentDraft)
      return
    }

    onUpdateSet(set, { [field]: nextValue })
  }

  return (
    <div
      className={`grid grid-cols-[2.5rem_1fr_1fr_2.75rem_2.75rem] gap-2 rounded-lg p-2 ${
        set.is_completed ? 'bg-green-500/15 ring-1 ring-green-400/30' : 'bg-surface-card'
      }`}
    >
      <div className="flex items-center justify-center text-sm text-gray-400">{set.set_order + 1}</div>
      <Input
        inputMode="decimal"
        value={weightDraft}
        placeholder="lb"
        onChange={(event) => setWeightDraft(event.target.value)}
        onBlur={() => commitNumber('weight', weightDraft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <Input
        inputMode="numeric"
        value={repsDraft}
        placeholder="reps"
        onChange={(event) => setRepsDraft(event.target.value)}
        onBlur={() => commitNumber('reps', repsDraft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <button
        className="touch-target rounded-lg bg-surface-elevated text-green-300"
        onClick={() =>
          onUpdateSet(set, {
            is_completed: !set.is_completed,
            completed_at: !set.is_completed ? new Date().toISOString() : null,
          })
        }
        aria-label="Toggle completed"
      >
        <Check className="mx-auto h-5 w-5" aria-hidden="true" />
      </button>
      <button
        className="touch-target rounded-lg bg-surface-elevated text-gray-300"
        onClick={() => onDeleteSet(set)}
        aria-label="Delete set"
      >
        <Trash2 className="mx-auto h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

function formatSetValue(value: number | null): string {
  return value === null ? '' : String(value)
}
