import { memo, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Dumbbell, Plus, TimerReset, Trash2, X } from 'lucide-react'
import { mergeSetRpe, parseSetRpe } from '../lib/training'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { ExerciseSummary } from './ExerciseSummary'
import { EmptyState, FixedBottomActions, IconButton, Input, PrimaryButton, SecondaryButton, SurfaceCard, Textarea, cn } from './ui'

type Props = {
  workout: Workout | null
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  previousSetsByExerciseId: Map<string, WorkoutSet[]>
  onCreateWorkout: () => void
  onOpenExercisePicker: () => void
  onOpenExerciseDetails: (exercise: Exercise) => void
  onAddSet: (workoutExerciseId: string) => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onFinishWorkout: () => void
  onLeaveWorkout: () => void
  onUpdateWorkout: (workout: Workout, patch: Partial<Workout>) => void
}

const DEFAULT_REST_SECONDS = 90

export function WorkoutLogger({
  workout,
  workoutExercises,
  sets,
  exerciseById,
  previousSetsByExerciseId,
  onCreateWorkout,
  onOpenExercisePicker,
  onOpenExerciseDetails,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onFinishWorkout,
  onLeaveWorkout,
  onUpdateWorkout,
}: Props) {
  const setsByWorkoutExercise = useMemo(() => {
    const grouped = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      grouped.set(set.workout_exercise_id, [...(grouped.get(set.workout_exercise_id) ?? []), set].sort((a, b) => a.set_order - b.set_order))
    }
    return grouped
  }, [sets])
  const [nameDraft, setNameDraft] = useState(workout?.name ?? '')
  const [notesDraft, setNotesDraft] = useState(workout?.notes ?? '')

  useEffect(() => {
    setNameDraft(workout?.name ?? '')
    setNotesDraft(workout?.notes ?? '')
  }, [workout?.id, workout?.name, workout?.notes])

  if (!workout) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No active workout"
        description="Start an empty workout or begin one from a saved routine."
        action={<PrimaryButton onClick={onCreateWorkout}>Start Empty Workout</PrimaryButton>}
      />
    )
  }

  return (
    <div className="space-y-5 pb-36">
      <header className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onLeaveWorkout} className="text-sm font-medium text-text-secondary">
            Cancel
          </button>
          <WorkoutTimer startedAt={workout.started_at} />
          <button type="button" onClick={onFinishWorkout} className="text-sm font-medium text-accent-blue">
            Finish
          </button>
        </div>
        <SurfaceCard className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-secondary">Workout name</span>
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                if (nameDraft !== workout.name) onUpdateWorkout(workout, { name: nameDraft.trim() || 'Workout' })
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-secondary">Notes</span>
            <Textarea
              className="min-h-[96px]"
              value={notesDraft}
              placeholder="Optional notes"
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={() => {
                if (notesDraft !== (workout.notes ?? '')) onUpdateWorkout(workout, { notes: notesDraft.trim() || null })
              }}
            />
          </label>
        </SurfaceCard>
      </header>

      <div className="space-y-4">
        {workoutExercises.length ? (
          workoutExercises.map((item) => (
            <ActiveWorkoutExerciseCard
              key={item.id}
              exercise={exerciseById.get(item.exercise_id) ?? null}
              sets={setsByWorkoutExercise.get(item.id) ?? []}
              previousSets={previousSetsByExerciseId.get(item.exercise_id) ?? []}
              onOpenDetails={() => {
                const exercise = exerciseById.get(item.exercise_id)
                if (exercise) onOpenExerciseDetails(exercise)
              }}
              onAddSet={() => onAddSet(item.id)}
              onUpdateSet={onUpdateSet}
              onDeleteSet={onDeleteSet}
            />
          ))
        ) : (
          <EmptyState
            icon={Plus}
            title="Add your first exercise"
            description="Use the exercise library to build the workout."
            action={<PrimaryButton onClick={onOpenExercisePicker}>Browse Exercises</PrimaryButton>}
          />
        )}
      </div>

      <FixedBottomActions>
        <SecondaryButton className="flex-1" onClick={onOpenExercisePicker}>
          Add Exercise
        </SecondaryButton>
        <PrimaryButton className="flex-1" onClick={onFinishWorkout}>
          Finish Workout
        </PrimaryButton>
      </FixedBottomActions>
    </div>
  )
}

export function WorkoutTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime())
  const hours = Math.floor(elapsedMs / 3_600_000)
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1000)

  return (
    <div className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-2 text-sm font-semibold">
      <Clock3 className="h-4 w-4 text-accent-blue" aria-hidden="true" />
      <span>
        {hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`}
      </span>
    </div>
  )
}

export function ActiveWorkoutExerciseCard({
  exercise,
  sets,
  previousSets,
  onAddSet,
  onOpenDetails,
  onUpdateSet,
  onDeleteSet,
}: {
  exercise: Exercise | null
  sets: WorkoutSet[]
  previousSets: WorkoutSet[]
  onAddSet: () => void
  onOpenDetails: () => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
}) {
  const [restEndAt, setRestEndAt] = useState<number | null>(null)

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
        <IconButton aria-label={`Add set to ${exercise?.name ?? 'exercise'}`} onClick={onAddSet}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="grid grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        <span>Set</span>
        <span>Previous</span>
        <span>Weight</span>
        <span>Reps</span>
        <span>RPE</span>
        <span>Done</span>
      </div>

      <div className="space-y-2">
        {sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            previousSet={previousSets[index] ?? null}
            onUpdateSet={onUpdateSet}
            onDeleteSet={onDeleteSet}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <SecondaryButton className="flex-1" onClick={onAddSet}>
          Add Set
        </SecondaryButton>
        <SecondaryButton className="flex-1" onClick={() => setRestEndAt(Date.now() + DEFAULT_REST_SECONDS * 1000)}>
          <TimerReset className="h-4 w-4" aria-hidden="true" />
          Start Rest Timer
        </SecondaryButton>
      </div>

      {restEndAt ? <RestTimer endAt={restEndAt} onClear={() => setRestEndAt(null)} /> : null}
    </SurfaceCard>
  )
}

export function RestTimer({ endAt, onClear }: { endAt: number; onClear: () => void }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remainingMs = Math.max(0, endAt - now)
  const seconds = Math.ceil(remainingMs / 1000)

  useEffect(() => {
    if (remainingMs > 0) return
    onClear()
  }, [onClear, remainingMs])

  return (
    <div className="flex items-center justify-between rounded-2xl border border-accent-done/20 bg-surface-success px-4 py-3 text-sm">
      <div>
        <div className="font-semibold text-accent-done">Rest timer running</div>
        <div className="text-text-secondary">{seconds}s remaining</div>
      </div>
      <button type="button" onClick={onClear} className="text-text-secondary">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export const SetRow = memo(function SetRow({
  set,
  previousSet,
  onUpdateSet,
  onDeleteSet,
}: {
  set: WorkoutSet
  previousSet: WorkoutSet | null
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
}) {
  const [weightDraft, setWeightDraft] = useState(formatValue(set.weight))
  const [repsDraft, setRepsDraft] = useState(formatValue(set.reps))
  const [rpeDraft, setRpeDraft] = useState(parseSetRpe(set.notes))

  useEffect(() => setWeightDraft(formatValue(set.weight)), [set.weight])
  useEffect(() => setRepsDraft(formatValue(set.reps)), [set.reps])
  useEffect(() => setRpeDraft(parseSetRpe(set.notes)), [set.notes])

  function commitNumber(field: 'weight' | 'reps', draft: string) {
    const currentValue = field === 'weight' ? set.weight : set.reps
    const currentDraft = formatValue(currentValue)
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

  function commitRpe() {
    const nextNotes = mergeSetRpe(set.notes, rpeDraft)
    if (nextNotes === set.notes) return
    onUpdateSet(set, { notes: nextNotes })
  }

  return (
    <div className={cn('grid grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 rounded-2xl p-2', set.is_completed ? 'bg-surface-success ring-1 ring-accent-done/25' : 'bg-surface-input')}>
      <div className="flex items-center justify-center text-sm text-text-secondary">{set.set_order + 1}</div>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-surface-card px-2 text-left text-xs text-text-secondary"
        onClick={() => {
          if (!previousSet) return
          if (previousSet.weight !== null) {
            setWeightDraft(formatValue(previousSet.weight))
            onUpdateSet(set, { weight: previousSet.weight })
          }
          if (previousSet.reps !== null) {
            setRepsDraft(formatValue(previousSet.reps))
            onUpdateSet(set, { reps: previousSet.reps })
          }
        }}
      >
        {previousSet ? formatPreviousSet(previousSet) : '--'}
      </button>
      <input
        inputMode="decimal"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={weightDraft}
        placeholder="0"
        onChange={(event) => setWeightDraft(event.target.value)}
        onBlur={() => commitNumber('weight', weightDraft)}
      />
      <input
        inputMode="numeric"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={repsDraft}
        placeholder="0"
        onChange={(event) => setRepsDraft(event.target.value)}
        onBlur={() => commitNumber('reps', repsDraft)}
      />
      <input
        inputMode="decimal"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={rpeDraft}
        placeholder="8"
        onChange={(event) => setRpeDraft(event.target.value)}
        onBlur={commitRpe}
      />
      <button
        type="button"
        className="touch-target rounded-xl bg-surface-card text-accent-done"
        onClick={() =>
          onUpdateSet(set, {
            is_completed: !set.is_completed,
            completed_at: !set.is_completed ? new Date().toISOString() : null,
          })
        }
        aria-label={set.is_completed ? 'Mark set incomplete' : 'Mark set complete'}
      >
        <CheckCircle2 className="mx-auto h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="touch-target col-span-full inline-flex items-center justify-end gap-2 text-sm text-text-secondary"
        onClick={() => onDeleteSet(set)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete set
      </button>
    </div>
  )
})

function formatValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatPreviousSet(set: WorkoutSet): string {
  if (set.weight !== null && set.reps !== null) return `${set.weight} x ${set.reps}`
  if (set.reps !== null) return `${set.reps} reps`
  return '--'
}
