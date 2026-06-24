import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock3, Dumbbell, Plus, Trash2, X } from 'lucide-react'
import { mergeSetRpe, parseSetRpe } from '../lib/training'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { ExerciseSummary } from './ExerciseSummary'
import { BottomSheet, ConfirmDialog, EmptyState, Field, FixedBottomActions, IconButton, Input, PrimaryButton, SecondaryButton, SurfaceCard, Textarea, cn } from './ui'

type Props = {
  isLoading?: boolean
  workout: Workout | null
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  previousSetsByExerciseId: Map<string, WorkoutSet[]>
  historicalRecordsByExerciseId: Map<string, ExerciseRecord>
  onCreateWorkout: () => void
  onOpenExercisePicker: () => void
  onOpenExerciseDetails: (exercise: Exercise) => void
  onAddSet: (workoutExerciseId: string) => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onFinishWorkout: () => void
  onDiscardWorkout: () => void
  onUpdateWorkout: (workout: Workout, patch: Partial<Workout>) => void
}

type ExerciseRecord = {
  maxWeight: number
  volume: number
}

type WorkoutPr = {
  exerciseName: string
  kind: 'Max Weight' | 'Volume'
  value: number
  previous: number
  unit: string
}

const DEFAULT_REST_SECONDS = 90
const REST_TIMER_STORAGE_KEY = 'strengthos:workout-rest-seconds'
const REST_MINUTES = Array.from({ length: 60 }, (_, index) => index)
const REST_SECONDS = Array.from({ length: 60 }, (_, index) => index)

type RestTimerTarget =
  | { kind: 'workout' }
  | { kind: 'exercise'; workoutExerciseId: string; exerciseName: string | null }

export function WorkoutLogger({
  isLoading = false,
  workout,
  workoutExercises,
  sets,
  exerciseById,
  previousSetsByExerciseId,
  historicalRecordsByExerciseId,
  onCreateWorkout,
  onOpenExercisePicker,
  onOpenExerciseDetails,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onFinishWorkout,
  onDiscardWorkout,
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
  const [workoutRestSeconds, setWorkoutRestSeconds] = useState(loadWorkoutRestSeconds)
  const [exerciseRestSeconds, setExerciseRestSeconds] = useState<Map<string, number>>(() => new Map())
  const [restTimerTarget, setRestTimerTarget] = useState<RestTimerTarget | null>(null)
  const [restEndAt, setRestEndAt] = useState<number | null>(null)
  const [isFinishSheetOpen, setIsFinishSheetOpen] = useState(false)
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false)

  useEffect(() => {
    setNameDraft(workout?.name ?? '')
    setNotesDraft(workout?.notes ?? '')
  }, [workout?.id, workout?.name, workout?.notes])

  useEffect(() => {
    localStorage.setItem(REST_TIMER_STORAGE_KEY, String(workoutRestSeconds))
  }, [workoutRestSeconds])

  useEffect(() => {
    setExerciseRestSeconds(new Map())
    setRestEndAt(null)
    setIsFinishSheetOpen(false)
    setIsDiscardConfirmOpen(false)
  }, [workout?.id])

  const selectedRestSeconds =
    restTimerTarget?.kind === 'exercise'
      ? exerciseRestSeconds.get(restTimerTarget.workoutExerciseId) ?? workoutRestSeconds
      : workoutRestSeconds

  function saveRestSeconds(seconds: number) {
    if (restTimerTarget?.kind === 'exercise') {
      setExerciseRestSeconds((current) => {
        const next = new Map(current)
        next.set(restTimerTarget.workoutExerciseId, seconds)
        return next
      })
    } else {
      setWorkoutRestSeconds(seconds)
    }
    setRestTimerTarget(null)
  }

  function startRestTimer(seconds: number) {
    setRestEndAt(Date.now() + seconds * 1000)
  }

  if (!workout && isLoading) {
    return (
      <SurfaceCard className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/10" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/10" />
      </SurfaceCard>
    )
  }

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
          <WorkoutTimer startedAt={workout.started_at} />
          <button type="button" onClick={() => setIsFinishSheetOpen(true)} className="text-sm font-medium text-accent-blue">
            Finish
          </button>
        </div>
        {restEndAt ? <RestTimer endAt={restEndAt} onClear={() => setRestEndAt(null)} /> : null}
        <SurfaceCard className="space-y-4">
          <Field label="Workout name">
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                if (nameDraft !== workout.name) onUpdateWorkout(workout, { name: nameDraft.trim() || 'Workout' })
              }}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              className="min-h-[96px]"
              value={notesDraft}
              placeholder="Optional notes"
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={() => {
                if (notesDraft !== (workout.notes ?? '')) onUpdateWorkout(workout, { notes: notesDraft.trim() || null })
              }}
            />
          </Field>
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
            onClick={() => setRestTimerTarget({ kind: 'workout' })}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Clock3 className="h-4 w-4 text-accent-blue" aria-hidden="true" />
              Default rest
            </span>
            <span className="font-semibold">{formatRestDuration(workoutRestSeconds)}</span>
          </button>
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
              workoutRestSeconds={workoutRestSeconds}
              restSecondsOverride={exerciseRestSeconds.get(item.id) ?? null}
              onStartRestTimer={startRestTimer}
              onChangeRestSeconds={() => {
                const exercise = exerciseById.get(item.exercise_id)
                setRestTimerTarget({ kind: 'exercise', workoutExerciseId: item.id, exerciseName: exercise?.name ?? null })
              }}
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
        <PrimaryButton className="flex-1" onClick={() => setIsFinishSheetOpen(true)}>
          Finish Workout
        </PrimaryButton>
      </FixedBottomActions>

      <FinishWorkoutSheet
        open={isFinishSheetOpen}
        workout={workout}
        workoutExercises={workoutExercises}
        setsByWorkoutExercise={setsByWorkoutExercise}
        exerciseById={exerciseById}
        historicalRecordsByExerciseId={historicalRecordsByExerciseId}
        onClose={() => setIsFinishSheetOpen(false)}
        onSave={onFinishWorkout}
        onDiscard={() => setIsDiscardConfirmOpen(true)}
      />

      <ConfirmDialog
        open={isDiscardConfirmOpen}
        onClose={() => setIsDiscardConfirmOpen(false)}
        title="Discard workout?"
        description="This permanently deletes this workout, its exercises, and its sets."
        footer={
          <div className="flex gap-3">
            <SecondaryButton className="flex-1" onClick={() => setIsDiscardConfirmOpen(false)}>
              Keep Editing
            </SecondaryButton>
            <PrimaryButton className="flex-1 bg-accent-danger active:bg-red-600" onClick={onDiscardWorkout}>
              Discard
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">Saving keeps the workout in your history. Discarding cannot be undone.</p>
      </ConfirmDialog>

      <RestDurationSheet
        open={restTimerTarget !== null}
        title={restTimerTarget?.kind === 'exercise' ? restTimerTarget.exerciseName ?? 'Exercise rest' : 'Default rest'}
        value={selectedRestSeconds}
        onClose={() => setRestTimerTarget(null)}
        onSave={saveRestSeconds}
      />
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
  workoutRestSeconds,
  restSecondsOverride,
  onStartRestTimer,
  onChangeRestSeconds,
  onOpenDetails,
  onUpdateSet,
  onDeleteSet,
}: {
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
}) {
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
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-input text-text-secondary transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            aria-label={`Set rest for ${exercise?.name ?? 'exercise'} (${formatRestDuration(effectiveRestSeconds)})`}
            title={`Rest ${formatRestDuration(effectiveRestSeconds)}`}
            onClick={onChangeRestSeconds}
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
          </button>
          <IconButton aria-label={`Add set to ${exercise?.name ?? 'exercise'}`} onClick={onAddSet}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
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

function FinishWorkoutSheet({
  open,
  workout,
  workoutExercises,
  setsByWorkoutExercise,
  exerciseById,
  historicalRecordsByExerciseId,
  onClose,
  onSave,
  onDiscard,
}: {
  open: boolean
  workout: Workout
  workoutExercises: WorkoutExercise[]
  setsByWorkoutExercise: Map<string, WorkoutSet[]>
  exerciseById: Map<string, Exercise>
  historicalRecordsByExerciseId: Map<string, ExerciseRecord>
  onClose: () => void
  onSave: () => void
  onDiscard: () => void
}) {
  const summary = buildWorkoutSummary({
    workout,
    workoutExercises,
    setsByWorkoutExercise,
    exerciseById,
    historicalRecordsByExerciseId,
  })

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Finish Workout"
      description="Review the session before saving."
      footer={
        <div className="grid gap-3">
          <PrimaryButton onClick={onSave}>Save Workout</PrimaryButton>
          <button type="button" className="min-h-11 text-sm font-semibold text-accent-danger" onClick={onDiscard}>
            Discard Workout
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <SummaryMetric label="Lifted" value={`${formatNumber(summary.totalVolume)} lb`} />
          <SummaryMetric label="Sets" value={String(summary.completedSets)} />
          <SummaryMetric label="Time" value={formatDuration(summary.durationSeconds)} />
        </div>

        <div>
          <h3 className="text-base font-semibold">Records</h3>
          {summary.prs.length ? (
            <div className="mt-3 space-y-2">
              {summary.prs.map((pr) => (
                <div key={`${pr.exerciseName}-${pr.kind}`} className="rounded-2xl border border-accent-done/20 bg-surface-success px-3 py-3">
                  <div className="text-sm font-semibold text-accent-done">{pr.kind} PR</div>
                  <div className="mt-1 text-sm">{pr.exerciseName}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {formatNumber(pr.value)} {pr.unit}
                    {pr.previous > 0 ? ` beat ${formatNumber(pr.previous)} ${pr.unit}` : ' first recorded PR'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-2xl bg-surface-input px-3 py-3 text-sm text-text-secondary">No new PRs this session.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-input p-3">
      <div className="text-xs font-medium uppercase text-text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
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
        <div className="text-text-secondary">{formatRestDuration(seconds)} remaining</div>
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
  onCompleteSet,
}: {
  set: WorkoutSet
  previousSet: WorkoutSet | null
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onCompleteSet: () => void
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

  function toggleCompleted() {
    const isCompleting = !set.is_completed
    onUpdateSet(set, {
      is_completed: isCompleting,
      completed_at: isCompleting ? new Date().toISOString() : null,
    })
    if (isCompleting) onCompleteSet()
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
        className={cn(
          'touch-target rounded-xl bg-surface-card transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
          set.is_completed ? 'text-accent-done' : 'text-text-muted',
        )}
        onClick={toggleCompleted}
        aria-label={set.is_completed ? 'Mark set incomplete' : 'Mark set complete'}
        aria-pressed={set.is_completed}
      >
        <CheckCircle2 className={cn('mx-auto h-5 w-5', !set.is_completed && 'opacity-45')} aria-hidden="true" />
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

function RestDurationSheet({
  open,
  title,
  value,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  value: number
  onClose: () => void
  onSave: (seconds: number) => void
}) {
  const [minutes, setMinutes] = useState(() => Math.floor(value / 60))
  const [seconds, setSeconds] = useState(() => value % 60)

  useEffect(() => {
    setMinutes(Math.floor(value / 60))
    setSeconds(value % 60)
  }, [value, open])

  const nextSeconds = Math.max(1, minutes * 60 + seconds)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      description="Scroll to choose minutes and seconds."
      footer={
        <div className="flex gap-3">
          <SecondaryButton className="flex-1" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => onSave(nextSeconds)}>
            Set
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <RestWheel label="Min" value={minutes} values={REST_MINUTES} onChange={setMinutes} />
        <RestWheel label="Sec" value={seconds} values={REST_SECONDS} onChange={setSeconds} />
      </div>
    </BottomSheet>
  )
}

function RestWheel({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: number
  values: number[]
  onChange: (value: number) => void
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [value])

  return (
    <div>
      <span className="mb-2 block text-center text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <div
        className="scrollable-touch scrollbar-hidden h-48 overflow-y-auto rounded-2xl border border-white/10 bg-surface-input p-2"
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${label}-${value}`}
        tabIndex={0}
      >
        {values.map((item) => (
          <button
            key={item}
            id={`${label}-${item}`}
            ref={item === value ? selectedRef : undefined}
            type="button"
            className={cn(
              'block min-h-11 w-full rounded-xl text-center text-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
              item === value ? 'bg-accent-blue text-white' : 'text-text-secondary active:bg-surface-elevated',
            )}
            role="option"
            aria-selected={item === value}
            onClick={() => onChange(item)}
          >
            {String(item).padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  )
}

function loadWorkoutRestSeconds(): number {
  const stored = localStorage.getItem(REST_TIMER_STORAGE_KEY)
  const parsed = stored ? Number(stored) : DEFAULT_REST_SECONDS
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_REST_SECONDS
}

function formatRestDuration(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(normalizedSeconds / 60)
  const seconds = normalizedSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function buildWorkoutSummary({
  workout,
  workoutExercises,
  setsByWorkoutExercise,
  exerciseById,
  historicalRecordsByExerciseId,
}: {
  workout: Workout
  workoutExercises: WorkoutExercise[]
  setsByWorkoutExercise: Map<string, WorkoutSet[]>
  exerciseById: Map<string, Exercise>
  historicalRecordsByExerciseId: Map<string, ExerciseRecord>
}) {
  const prs: WorkoutPr[] = []
  let totalVolume = 0
  let completedSets = 0

  for (const workoutExercise of workoutExercises) {
    const exercise = exerciseById.get(workoutExercise.exercise_id)
    const liftSets = (setsByWorkoutExercise.get(workoutExercise.id) ?? []).filter(isLiftSet)
    if (!liftSets.length) continue

    const exerciseVolume = liftSets.reduce((total, set) => total + (set.weight ?? 0) * (set.reps ?? 0), 0)
    const maxWeight = Math.max(...liftSets.map((set) => set.weight ?? 0))
    const previous = historicalRecordsByExerciseId.get(workoutExercise.exercise_id) ?? { maxWeight: 0, volume: 0 }
    const exerciseName = exercise?.name ?? 'Exercise'

    totalVolume += exerciseVolume
    completedSets += liftSets.length

    if (maxWeight > previous.maxWeight) {
      prs.push({
        exerciseName,
        kind: 'Max Weight',
        value: maxWeight,
        previous: previous.maxWeight,
        unit: 'lb',
      })
    }

    if (exerciseVolume > previous.volume) {
      prs.push({
        exerciseName,
        kind: 'Volume',
        value: exerciseVolume,
        previous: previous.volume,
        unit: 'lb',
      })
    }
  }

  return {
    totalVolume,
    completedSets,
    durationSeconds: Math.max(0, Math.round((Date.now() - new Date(workout.started_at).getTime()) / 1000)),
    prs,
  }
}

function isLiftSet(set: WorkoutSet): boolean {
  return Boolean(set.is_completed && set.weight && set.reps)
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function formatPreviousSet(set: WorkoutSet): string {
  if (set.weight !== null && set.reps !== null) return `${set.weight} x ${set.reps}`
  if (set.reps !== null) return `${set.reps} reps`
  return '--'
}
