import { CalendarDays, Check, Dumbbell, RotateCcw, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { isWorkingSet, loadedVolume } from '../lib/trainingMetrics'
import { Input, MetricCard, PrimaryButton } from './ui'

export type WorkoutDetail = {
  workoutExercise: WorkoutExercise
  exercise: Exercise | null
  sets: WorkoutSet[]
}

type WorkoutSummaryRowProps = {
  workout: Workout
  details: WorkoutDetail[]
  onSelect: (workout: Workout) => void
}

export function useWorkoutDetails(
  workout: Workout | null,
  workoutExercises: WorkoutExercise[],
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
) {
  return useMemo(
    () => getWorkoutDetails(workout, workoutExercises, sets, exerciseById),
    [exerciseById, sets, workout, workoutExercises],
  )
}

export function getWorkoutDetails(
  workout: Workout | null,
  workoutExercises: WorkoutExercise[],
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
): WorkoutDetail[] {
  if (!workout) return []
  const setsByWorkoutExerciseId = new Map<string, WorkoutSet[]>()
  for (const set of sets) {
    setsByWorkoutExerciseId.set(set.workout_exercise_id, [
      ...(setsByWorkoutExerciseId.get(set.workout_exercise_id) ?? []),
      set,
    ])
  }

  return workoutExercises
    .filter((item) => item.workout_id === workout.id)
    .sort((left, right) => left.exercise_order - right.exercise_order)
    .map((item) => ({
      workoutExercise: item,
      exercise: exerciseById.get(item.exercise_id) ?? null,
      sets: (setsByWorkoutExerciseId.get(item.id) ?? []).sort((left, right) => left.set_order - right.set_order),
    }))
}

export function buildWorkoutDetailsByWorkoutId(
  workouts: Workout[],
  workoutExercises: WorkoutExercise[],
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
) {
  const workoutIds = new Set(workouts.map((workout) => workout.id))
  const exercisesByWorkoutId = new Map<string, WorkoutExercise[]>()
  const setsByWorkoutExerciseId = new Map<string, WorkoutSet[]>()

  for (const item of workoutExercises) {
    if (!workoutIds.has(item.workout_id)) continue
    exercisesByWorkoutId.set(item.workout_id, [...(exercisesByWorkoutId.get(item.workout_id) ?? []), item])
  }
  for (const set of sets) {
    setsByWorkoutExerciseId.set(set.workout_exercise_id, [...(setsByWorkoutExerciseId.get(set.workout_exercise_id) ?? []), set])
  }

  return new Map(workouts.map((workout) => [
    workout.id,
    (exercisesByWorkoutId.get(workout.id) ?? [])
      .sort((left, right) => left.exercise_order - right.exercise_order)
      .map((item): WorkoutDetail => ({
        workoutExercise: item,
        exercise: exerciseById.get(item.exercise_id) ?? null,
        sets: (setsByWorkoutExerciseId.get(item.id) ?? []).sort((left, right) => left.set_order - right.set_order),
      })),
  ]))
}

export function WorkoutSummaryRow({ workout, details, onSelect }: WorkoutSummaryRowProps) {
  const summary = summarizeWorkout(workout, details)

  return (
    <button
      type="button"
      className="flex min-h-24 w-full cursor-pointer items-start justify-between gap-4 rounded-button px-1 py-3 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      onClick={() => onSelect(workout)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{workout.name || 'Workout'}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatWorkoutDate(workout)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            {details.length} exercise{details.length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Check className="h-4 w-4" aria-hidden="true" />
            {summary.completedSets} set{summary.completedSets === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{summarizeExerciseNames(details)}</p>
        <p className="mt-1 text-xs tabular-nums text-text-muted">
          {formatDuration(workout)} · {formatNumber(summary.totalVolume)} lb volume
        </p>
      </div>
      <span className="mt-1 text-lg text-text-muted" aria-hidden="true">›</span>
    </button>
  )
}

export function WorkoutDetails({
  workout,
  details,
  onRepeat,
  isRepeating = false,
  onUpdateSet,
}: {
  workout: Workout | null
  details: WorkoutDetail[]
  onRepeat?: () => void
  isRepeating?: boolean
  onUpdateSet?: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
}) {
  const summary = summarizeWorkout(workout, details)

  if (!details.length) {
    return (
      <div className="space-y-4">
        <p className="rounded-card bg-surface-input p-4 text-sm text-text-secondary">No exercises were logged for this workout.</p>
        {onRepeat ? <RepeatButton onRepeat={onRepeat} isRepeating={isRepeating} disabled /> : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Duration" value={workout ? formatDuration(workout) : '—'} />
        <MetricCard label="Completed sets" value={String(summary.completedSets)} />
        <MetricCard label="Exercises" value={String(details.length)} />
        <MetricCard label="Volume" value={`${formatNumber(summary.totalVolume)} lb`} />
      </div>
      {workout?.notes ? (
        <div className="rounded-card border border-white/10 bg-surface-input p-3">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{workout.notes}</p>
        </div>
      ) : null}
      <div className="space-y-3">
        {details.map((detail) => (
          <div key={detail.workoutExercise.id} className="rounded-card border border-white/10 bg-surface-input p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{detail.exercise?.name ?? 'Unknown exercise'}</h3>
                <p className="mt-1 text-xs text-text-muted">{detail.exercise?.equipment ?? 'No equipment'}</p>
              </div>
              <Trophy className="h-4 w-4 shrink-0 text-accent-blue" aria-hidden="true" />
            </div>
            <div className="mt-3 space-y-2">
              {detail.sets.length ? (
                detail.sets.map((set, setIndex) => (
                  <div key={set.id} className="space-y-2">
                  <div className="grid grid-cols-[52px_1fr_auto] gap-2 text-sm">
                    <span className="text-text-muted">Set {setIndex + 1}</span>
                    <span className="text-text-secondary">{formatSet(set)}</span>
                    <span className={set.is_completed ? 'text-accent-done' : 'text-text-muted'}>
                      {set.is_completed ? 'Done' : 'Planned'}
                    </span>
                  </div>
                  {onUpdateSet ? (
                    <div className="grid grid-cols-3 gap-2">
                      {detail.workoutExercise.logging_mode === 'duration' ? <HistoryNumber label="Seconds" value={set.duration_seconds} onCommit={(value) => onUpdateSet(set, { duration_seconds: value })} /> : null}
                      {detail.workoutExercise.logging_mode === 'assisted_bodyweight' ? <HistoryNumber label="Assistance" value={set.assistance_weight} onCommit={(value) => onUpdateSet(set, { assistance_weight: value })} /> : null}
                      {detail.workoutExercise.logging_mode === 'weight_reps' || detail.workoutExercise.logging_mode === 'weighted_bodyweight' ? <HistoryNumber label={detail.workoutExercise.logging_mode === 'weighted_bodyweight' ? 'Added weight' : 'Weight'} value={set.weight} onCommit={(value) => onUpdateSet(set, { weight: value })} /> : null}
                      {detail.workoutExercise.logging_mode !== 'duration' ? <HistoryNumber label="Reps" value={set.reps} onCommit={(value) => onUpdateSet(set, { reps: value })} /> : null}
                      <HistoryNumber label="RPE" value={set.rpe} onCommit={(value) => onUpdateSet(set, { rpe: value })} />
                      <select className="rounded-xl border border-white/10 bg-surface-card px-2 py-2 text-xs" value={set.set_type} onChange={(event) => onUpdateSet(set, { set_type: event.target.value as WorkoutSet['set_type'] })}>
                        <option value="working">Working</option><option value="warmup">Warm-up</option><option value="failure">Failure</option><option value="drop">Drop</option>
                      </select>
                    </div>
                  ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-secondary">No sets logged.</p>
              )}
            </div>
            {detail.sets.some((set) => set.notes) ? (
              <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-text-muted">
                {detail.sets.map((set, setIndex) => set.notes ? <p key={set.id}>Set {setIndex + 1}: {set.notes}</p> : null)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {onRepeat ? <RepeatButton onRepeat={onRepeat} isRepeating={isRepeating} /> : null}
    </div>
  )
}

function HistoryNumber({ label, value, onCommit }: { label: string; value: number | null; onCommit: (value: number | null) => void }) {
  return <label className="text-[10px] text-text-muted">{label}<Input className="mt-1 px-2 py-2 text-sm" defaultValue={value ?? ''} inputMode="decimal" onBlur={(event) => {
    const next = event.target.value.trim()
    const parsed = Number(next)
    if (next && (!Number.isFinite(parsed) || parsed < 0)) { event.target.value = value === null ? '' : String(value); return }
    onCommit(next ? parsed : null)
  }} /></label>
}

function RepeatButton({ onRepeat, isRepeating, disabled = false }: { onRepeat: () => void; isRepeating: boolean; disabled?: boolean }) {
  return (
    <PrimaryButton className="w-full" onClick={onRepeat} disabled={disabled || isRepeating}>
      <RotateCcw className="h-5 w-5" aria-hidden="true" />
      {isRepeating ? 'Starting…' : 'Repeat workout'}
    </PrimaryButton>
  )
}

export function summarizeWorkout(workout: Workout | null, details: WorkoutDetail[]) {
  const completedSets = details.flatMap((detail) => detail.sets.filter(isWorkingSet))
  return {
    completedSets: completedSets.length,
    totalVolume: details.reduce((total, detail) => total + detail.sets.reduce((sum, set) => sum + loadedVolume(set, detail.workoutExercise.logging_mode), 0), 0),
    durationMinutes: workout ? workoutDurationMinutes(workout) : 0,
  }
}

export function summarizeExerciseNames(details: WorkoutDetail[]) {
  const names = details.map((detail) => detail.exercise?.name).filter(Boolean)
  if (!names.length) return 'No exercises logged.'
  return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')
}

export function workoutDateKey(workout: Workout) {
  const date = new Date(workout.completed_at ?? workout.started_at)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatWorkoutDate(workout: Workout) {
  return new Date(workout.completed_at ?? workout.started_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDuration(workout: Workout) {
  const minutes = workoutDurationMinutes(workout)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function workoutDurationMinutes(workout: Workout) {
  if (workout.duration_seconds !== null) return Math.max(1, Math.round(workout.duration_seconds / 60))
  if (!workout.completed_at) return 0
  return Math.max(1, Math.round((new Date(workout.completed_at).getTime() - new Date(workout.started_at).getTime()) / 60_000))
}

function formatSet(set: WorkoutSet) {
  if (set.duration_seconds !== null) return `${set.duration_seconds}s`
  if (set.assistance_weight !== null && set.reps !== null) return `${set.assistance_weight} lb assist × ${set.reps}`
  if (set.weight !== null && set.reps !== null) return `${formatNumber(set.weight)} lb × ${set.reps}`
  if (set.reps !== null) return `${set.reps} reps`
  return set.is_completed ? 'Completed' : 'No values'
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
