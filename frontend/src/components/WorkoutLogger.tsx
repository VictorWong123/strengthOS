import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Dumbbell, Minus, Plus, Volume2, VolumeX, X } from 'lucide-react'
import type { Exercise, ExerciseSessionEvidence, LoggingMode, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { calculatePlatesPerSide, exerciseModeKey, isWorkingSet, loadedVolume, progressionSuggestion, warmupSets } from '../lib/trainingMetrics'
import { ExerciseSummary } from './ExerciseSummary'
import {
  BottomSheet,
  ConfirmDialog,
  DeleteIconButton,
  DeleteTextButton,
  EmptyState,
  Field,
  FixedBottomActions,
  IconButton,
  Input,
  MetricCard,
  PrimaryButton,
  SecondaryButton,
  SurfaceCard,
  Textarea,
  TimerIconButton,
  TimerPill,
  TimerSettingButton,
  cn,
} from './ui'

type Props = {
  isLoading?: boolean
  workout: Workout | null
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  previousSetsByExerciseId: Map<string, WorkoutSet[]>
  previousSessionsByExerciseMode: Map<string, ExerciseSessionEvidence[]>
  previousSessionNoteByExerciseId: Map<string, string>
  historicalRecordsByExerciseMode: Map<string, ExerciseRecord>
  onCreateWorkout: () => void
  onOpenExercisePicker: () => void
  onOpenExerciseDetails: (exercise: Exercise) => void
  onAddSet: (workoutExerciseId: string) => void
  onAddWarmups: (workoutExerciseId: string, targetWeight: number, barWeight: number, plates: number[]) => void
  onReplaceExercise: (item: WorkoutExercise) => void
  onRemoveExercise: (item: WorkoutExercise) => void
  onMoveExercise: (item: WorkoutExercise, direction: -1 | 1) => void
  onUpdateWorkoutExercise: (item: WorkoutExercise, patch: Partial<WorkoutExercise>) => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onFinishWorkout: () => void
  onDiscardWorkout: () => void
  onUpdateWorkout: (workout: Workout, patch: Partial<Workout>) => void
  setSyncState: Map<string, 'pending' | 'failed'>
  prAlertsEnabled: boolean
  onTogglePrAlerts: () => void
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
  previousSessionsByExerciseMode,
  previousSessionNoteByExerciseId,
  historicalRecordsByExerciseMode,
  onCreateWorkout,
  onOpenExercisePicker,
  onOpenExerciseDetails,
  onAddSet,
  onAddWarmups,
  onReplaceExercise,
  onRemoveExercise,
  onMoveExercise,
  onUpdateWorkoutExercise,
  onUpdateSet,
  onDeleteSet,
  onFinishWorkout,
  onDiscardWorkout,
  onUpdateWorkout,
  setSyncState,
  prAlertsEnabled,
  onTogglePrAlerts,
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
  const [alertsMuted, setAlertsMuted] = useState(() => localStorage.getItem('strengthos:timer-muted') === '1')
  const [alertVolume, setAlertVolume] = useState(() => Number(localStorage.getItem('strengthos:timer-volume') ?? '0.15'))
  const [vibrationEnabled, setVibrationEnabled] = useState(() => localStorage.getItem('strengthos:timer-vibration') !== '0')
  const [keepAwake, setKeepAwake] = useState(false)
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
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
    const rawOverrides = workout ? localStorage.getItem(`strengthos:rest-overrides:${workout.id}`) : null
    try { setExerciseRestSeconds(new Map(Object.entries(rawOverrides ? JSON.parse(rawOverrides) as Record<string, number> : {}))) } catch { setExerciseRestSeconds(new Map()) }
    const storedDeadline = workout ? Number(localStorage.getItem(`strengthos:rest:${workout.id}`)) : 0
    setRestEndAt(storedDeadline > Date.now() ? storedDeadline : null)
    setIsFinishSheetOpen(false)
    setIsDiscardConfirmOpen(false)
  }, [workout?.id])

  useEffect(() => {
    if (!workout) return
    const key = `strengthos:rest:${workout.id}`
    if (restEndAt) localStorage.setItem(key, String(restEndAt))
    else localStorage.removeItem(key)
  }, [restEndAt, workout])

  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return
    let active = true
    const acquire = () => void (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen').then((lock) => {
        if (active) wakeLockRef.current = lock
        else void lock.release()
      })
      .catch(() => setKeepAwake(false))
    acquire()
    const onVisibility = () => { if (document.visibilityState === 'visible' && active) acquire(); else wakeLockRef.current = null }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      void wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
  }, [keepAwake])

  const selectedRestSeconds =
    restTimerTarget?.kind === 'exercise'
      ? exerciseRestSeconds.get(restTimerTarget.workoutExerciseId) ?? workoutExercises.find((item) => item.id === restTimerTarget.workoutExerciseId)?.rest_seconds ?? workoutRestSeconds
      : workoutRestSeconds

  function saveRestSeconds(seconds: number) {
    if (restTimerTarget?.kind === 'exercise') {
      setExerciseRestSeconds((current) => {
        const next = new Map(current)
        next.set(restTimerTarget.workoutExerciseId, seconds)
        if (workout) localStorage.setItem(`strengthos:rest-overrides:${workout.id}`, JSON.stringify(Object.fromEntries(next)))
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

  function completeExerciseSet(item: WorkoutExercise, seconds: number) {
    if (!item.superset_group) { startRestTimer(seconds); return }
    const group = workoutExercises.filter((candidate) => candidate.superset_group === item.superset_group)
    const index = group.findIndex((candidate) => candidate.id === item.id)
    const next = group[(index + 1) % group.length]
    if (next && next.id !== group[0]?.id) {
      document.getElementById(`workout-exercise-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    startRestTimer(seconds)
  }

  function toggleSuperset(item: WorkoutExercise) {
    const index = workoutExercises.findIndex((candidate) => candidate.id === item.id)
    const neighbor = workoutExercises[index + 1]
    if (item.superset_group) {
      for (const member of workoutExercises.filter((candidate) => candidate.superset_group === item.superset_group)) onUpdateWorkoutExercise(member, { superset_group: null })
    } else if (neighbor) {
      const group = crypto.randomUUID()
      onUpdateWorkoutExercise(item, { superset_group: group })
      onUpdateWorkoutExercise(neighbor, { superset_group: group })
    }
  }

  function finishRestTimer() {
    if (!alertsMuted) playTimerSound(alertVolume)
    if (vibrationEnabled) navigator.vibrate?.([150, 80, 150])
    setRestEndAt(null)
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
          <div className="flex items-center gap-2">
            <WorkoutTimer workout={workout} />
            <button type="button" className="text-sm text-text-secondary" onClick={() => {
              if (workout.paused_at) {
                const pausedSeconds = Math.max(0, Math.round((Date.now() - new Date(workout.paused_at).getTime()) / 1000))
                onUpdateWorkout(workout, { paused_at: null, accumulated_pause_seconds: workout.accumulated_pause_seconds + pausedSeconds })
              } else {
                onUpdateWorkout(workout, { paused_at: new Date().toISOString() })
              }
            }}>{workout.paused_at ? 'Resume' : 'Pause'}</button>
          </div>
          <button type="button" onClick={() => setIsFinishSheetOpen(true)} className="text-sm font-medium text-accent-blue">Finish</button>
        </div>
        {restEndAt ? <RestTimer endAt={restEndAt} onChange={setRestEndAt} onClear={() => setRestEndAt(null)} onComplete={finishRestTimer} /> : null}
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
          <TimerSettingButton
            label="Default rest"
            value={formatRestDuration(workoutRestSeconds)}
            onClick={() => setRestTimerTarget({ kind: 'workout' })}
          />
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => {
              const next = !alertsMuted
              setAlertsMuted(next)
              localStorage.setItem('strengthos:timer-muted', next ? '1' : '0')
            }}>
              {alertsMuted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              {alertsMuted ? 'Muted' : 'Sound on'}
            </SecondaryButton>
            <SecondaryButton onClick={() => setKeepAwake((current) => !current)} aria-pressed={keepAwake}>
              {keepAwake ? 'Screen awake' : 'Keep awake'}
            </SecondaryButton>
            <SecondaryButton onClick={() => { const next = !vibrationEnabled; setVibrationEnabled(next); localStorage.setItem('strengthos:timer-vibration', next ? '1' : '0') }} aria-pressed={vibrationEnabled}>
              {vibrationEnabled ? 'Vibration on' : 'Vibration off'}
            </SecondaryButton>
            <SecondaryButton onClick={onTogglePrAlerts} aria-pressed={prAlertsEnabled}>{prAlertsEnabled ? 'PR alerts on' : 'PR alerts off'}</SecondaryButton>
            <label className="rounded-xl bg-surface-input px-3 py-2 text-xs text-text-secondary">Alert volume<input aria-label="Alert volume" className="mt-1 w-full" type="range" min="0.05" max="0.5" step="0.05" value={alertVolume} onChange={(event) => { const next = Number(event.target.value); setAlertVolume(next); localStorage.setItem('strengthos:timer-volume', String(next)) }} /></label>
          </div>
        </SurfaceCard>
      </header>

      <div className="space-y-4">
        {workoutExercises.length ? (
          workoutExercises.map((item) => (
            <ActiveWorkoutExerciseCard
              key={item.id}
              exercise={exerciseById.get(item.exercise_id) ?? null}
              workoutExercise={item}
              sets={setsByWorkoutExercise.get(item.id) ?? []}
              previousSets={previousSetsByExerciseId.get(item.exercise_id) ?? []}
              previousSessions={previousSessionsByExerciseMode.get(exerciseModeKey(item.exercise_id, item.logging_mode)) ?? []}
              previousSessionNote={previousSessionNoteByExerciseId.get(item.exercise_id) ?? null}
              onOpenDetails={() => {
                const exercise = exerciseById.get(item.exercise_id)
                if (exercise) onOpenExerciseDetails(exercise)
              }}
              onAddSet={() => onAddSet(item.id)}
              onAddWarmups={(targetWeight, barWeight, plates) => onAddWarmups(item.id, targetWeight, barWeight, plates)}
              onReplace={() => onReplaceExercise(item)}
              onRemove={() => onRemoveExercise(item)}
              onMove={(direction) => onMoveExercise(item, direction)}
              onToggleSuperset={() => toggleSuperset(item)}
              onUpdateSessionNotes={(session_notes) => onUpdateWorkoutExercise(item, { session_notes })}
              onUpdateLoggingMode={(logging_mode) => onUpdateWorkoutExercise(item, { logging_mode })}
              workoutRestSeconds={workoutRestSeconds}
              restSecondsOverride={exerciseRestSeconds.get(item.id) ?? null}
              onStartRestTimer={(seconds) => completeExerciseSet(item, seconds)}
              onChangeRestSeconds={() => {
                const exercise = exerciseById.get(item.exercise_id)
                setRestTimerTarget({ kind: 'exercise', workoutExerciseId: item.id, exerciseName: exercise?.name ?? null })
              }}
              onUpdateSet={onUpdateSet}
              onDeleteSet={onDeleteSet}
              setSyncState={setSyncState}
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
        historicalRecordsByExerciseMode={historicalRecordsByExerciseMode}
        onClose={() => setIsFinishSheetOpen(false)}
        onSave={onFinishWorkout}
        onDiscard={() => setIsDiscardConfirmOpen(true)}
      />

      <ConfirmDialog
        open={isDiscardConfirmOpen}
        onClose={() => setIsDiscardConfirmOpen(false)}
        title="Discard workout?"
        description="This permanently deletes this workout, its exercises, and all logged sets."
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
        <div className="rounded-card border border-accent-danger/20 bg-surface-danger p-3 text-sm text-text-secondary">
          This action cannot be undone. Finish the workout instead if you want it saved in your history.
        </div>
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

export function WorkoutTimer({ workout }: { workout: Workout }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const effectiveNow = workout.paused_at ? new Date(workout.paused_at).getTime() : now
  const elapsedMs = Math.max(0, effectiveNow - new Date(workout.started_at).getTime() - workout.accumulated_pause_seconds * 1000)
  const hours = Math.floor(elapsedMs / 3_600_000)
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1000)

  return (
    <TimerPill>
      {hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`}
    </TimerPill>
  )
}

export function ActiveWorkoutExerciseCard({
  exercise,
  workoutExercise,
  sets,
  previousSets,
  previousSessions,
  previousSessionNote,
  onAddSet,
  onAddWarmups,
  onReplace,
  onRemove,
  onMove,
  onToggleSuperset,
  onUpdateSessionNotes,
  onUpdateLoggingMode,
  workoutRestSeconds,
  restSecondsOverride,
  onStartRestTimer,
  onChangeRestSeconds,
  onOpenDetails,
  onUpdateSet,
  onDeleteSet,
  setSyncState,
}: {
  exercise: Exercise | null
  workoutExercise: WorkoutExercise
  sets: WorkoutSet[]
  previousSets: WorkoutSet[]
  previousSessions: ExerciseSessionEvidence[]
  previousSessionNote: string | null
  onAddSet: () => void
  onAddWarmups: (targetWeight: number, barWeight: number, plates: number[]) => void
  onReplace: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onToggleSuperset: () => void
  onUpdateSessionNotes: (notes: string | null) => void
  onUpdateLoggingMode: (mode: LoggingMode) => void
  workoutRestSeconds: number
  restSecondsOverride: number | null
  onStartRestTimer: (seconds: number) => void
  onChangeRestSeconds: () => void
  onOpenDetails: () => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  setSyncState: Map<string, 'pending' | 'failed'>
}) {
  const effectiveRestSeconds = restSecondsOverride ?? workoutExercise.rest_seconds ?? workoutRestSeconds
  const [suggestionIncrement, setSuggestionIncrement] = useState('5')
  const suggestion = progressionSuggestion(previousSessions.map((session) => session.sets), workoutExercise.target_reps, workoutExercise.target_rpe, Number(suggestionIncrement), workoutExercise.logging_mode, workoutExercise.target_sets ?? sets.length)

  return (
    <SurfaceCard id={`workout-exercise-${workoutExercise.id}`} className="space-y-4">
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

      {workoutExercise.target_reps || workoutExercise.target_rpe ? (
        <p className="rounded-xl bg-surface-input px-3 py-2 text-sm text-text-secondary">
          Target {workoutExercise.target_reps ?? 'reps as planned'}{workoutExercise.target_rpe ? ` @ RPE ${workoutExercise.target_rpe}` : ''}
        </p>
      ) : null}
      <label className="block text-xs text-text-secondary">Logging mode<select className="mt-1 min-h-11 w-full rounded-xl bg-surface-input px-3 text-sm" value={workoutExercise.logging_mode} disabled={sets.some((set) => set.is_completed)} onChange={(event) => onUpdateLoggingMode(event.target.value as LoggingMode)}><option value="weight_reps">Weight + reps</option><option value="bodyweight_reps">Bodyweight reps</option><option value="weighted_bodyweight">Added weight + reps</option><option value="assisted_bodyweight">Assistance + reps</option><option value="duration">Duration</option></select></label>
      {suggestion ? <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/10 px-3 py-2 text-sm"><span className="font-medium">Next session:</span> {suggestion}<span className="block text-xs text-text-muted">Evidence: {previousSessions.slice(0, 2).map((session) => `${new Date(session.date).toLocaleDateString()}: ${session.sets.filter((set) => set.is_completed && set.set_type !== 'warmup').map(formatPreviousSet).join(', ')}`).join(' · ')}. You can ignore this suggestion.</span><label className="mt-2 block text-xs">Load step (lb)<input className="ml-2 w-16 rounded bg-surface-card px-2 py-1" inputMode="decimal" value={suggestionIncrement} onChange={(event) => setSuggestionIncrement(event.target.value)} /></label></div> : null}
      <div className="flex flex-wrap gap-3 text-xs font-medium text-text-secondary">
        <button type="button" className="min-h-11 px-2" onClick={() => onMove(-1)}>Move up</button>
        <button type="button" className="min-h-11 px-2" onClick={() => onMove(1)}>Move down</button>
        <button type="button" className="min-h-11 px-2" onClick={onReplace}>Replace</button>
        <button type="button" onClick={onRemove} className="min-h-11 px-2 text-accent-danger">Remove</button>
        <button type="button" className="min-h-11 px-2 text-accent-blue" onClick={onToggleSuperset}>{workoutExercise.superset_group ? 'Ungroup' : 'Superset next'}</button>
      </div>
      {previousSessionNote ? <p className="text-xs text-text-muted">Previous note: {previousSessionNote}</p> : null}
      <Textarea defaultValue={workoutExercise.session_notes ?? ''} placeholder="Session observation" onBlur={(event) => onUpdateSessionNotes(event.target.value.trim() || null)} />

      <div className="grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        <span>Set</span>
        <span>Previous</span>
        <span>{workoutExercise.logging_mode === 'duration' ? 'Seconds' : workoutExercise.logging_mode === 'assisted_bodyweight' ? 'Assist' : workoutExercise.logging_mode === 'bodyweight_reps' ? 'Reps' : workoutExercise.logging_mode === 'weighted_bodyweight' ? 'Added' : 'Weight'}</span>
        <span>{workoutExercise.logging_mode === 'duration' || workoutExercise.logging_mode === 'bodyweight_reps' ? '' : 'Reps'}</span>
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
            onCompleteSet={() => { if (workoutExercise.timer_enabled && effectiveRestSeconds > 0) onStartRestTimer(effectiveRestSeconds) }}
            loggingMode={workoutExercise.logging_mode ?? exercise?.logging_mode ?? 'weight_reps'}
            syncState={setSyncState.get(set.id)}
          />
        ))}
      </div>

      <div className="flex">
        <SecondaryButton className="flex-1" onClick={onAddSet}>
          Add Set
        </SecondaryButton>
      </div>
      {workoutExercise.logging_mode === 'weight_reps' ? <PlateWarmupTools onAddWarmups={onAddWarmups} /> : null}
    </SurfaceCard>
  )
}

function PlateWarmupTools({ onAddWarmups }: { onAddWarmups: (targetWeight: number, barWeight: number, plates: number[]) => void }) {
  const [target, setTarget] = useState('135')
  const [bar, setBar] = useState('45')
  const [inventory, setInventory] = useState('45,45,35,35,25,25,10,10,5,5,2.5,2.5')
  const available = inventory.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0)
  const targetWeight = Number(target)
  const barWeight = Number(bar)
  const inputsValid = Number.isFinite(targetWeight) && targetWeight >= 0 && Number.isFinite(barWeight) && barWeight >= 0
  const loading = inputsValid ? calculatePlatesPerSide(targetWeight, barWeight, available) : null
  const warmups = inputsValid ? warmupSets(targetWeight, available, barWeight) : []
  return (
    <details className="rounded-xl bg-surface-input p-3">
      <summary className="cursor-pointer text-sm font-semibold">Plate & warm-up calculator</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2"><Input value={target} inputMode="decimal" onChange={(event) => setTarget(event.target.value)} aria-label="Target weight" /><Input value={bar} inputMode="decimal" onChange={(event) => setBar(event.target.value)} aria-label="Bar weight" /></div>
        <Input value={inventory} onChange={(event) => setInventory(event.target.value)} aria-label="Available plates per side" placeholder="Available plates, comma-separated" />
        <p className="text-sm text-text-secondary">Per side: {loading?.plates.join(' + ') || 'none'} · loaded {loading?.loadedWeight ?? 0} lb</p>
        <p className="text-xs text-text-muted">Warm-ups: {warmups.map((set) => `${set.weight}×${set.reps}`).join(', ') || 'none'}</p>
        <SecondaryButton className="w-full" disabled={!warmups.length} onClick={() => onAddWarmups(targetWeight, barWeight, available)}>Add warm-up sets</SecondaryButton>
      </div>
    </details>
  )
}

function FinishWorkoutSheet({
  open,
  workout,
  workoutExercises,
  setsByWorkoutExercise,
  exerciseById,
  historicalRecordsByExerciseMode,
  onClose,
  onSave,
  onDiscard,
}: {
  open: boolean
  workout: Workout
  workoutExercises: WorkoutExercise[]
  setsByWorkoutExercise: Map<string, WorkoutSet[]>
  exerciseById: Map<string, Exercise>
  historicalRecordsByExerciseMode: Map<string, ExerciseRecord>
  onClose: () => void
  onSave: () => void
  onDiscard: () => void
}) {
  const summary = buildWorkoutSummary({
    workout,
    workoutExercises,
    setsByWorkoutExercise,
    exerciseById,
    historicalRecordsByExerciseMode,
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
        </div>
      }
      headerAction={
        <DeleteIconButton
          label="Discard workout"
          className="mr-2 h-10 w-10"
          onClick={onDiscard}
        />
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Loaded" value={`${formatNumber(summary.totalVolume)} lb`} valueClassName="text-lg" />
          <MetricCard label="Sets" value={String(summary.completedSets)} valueClassName="text-lg" />
          <MetricCard label="Time" value={formatDuration(summary.durationSeconds)} valueClassName="text-lg" />
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

export function RestTimer({ endAt, onChange, onClear, onComplete }: { endAt: number; onChange: (value: number) => void; onClear: () => void; onComplete: () => void }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remainingMs = Math.max(0, endAt - now)
  const seconds = Math.ceil(remainingMs / 1000)

  useEffect(() => {
    if (remainingMs > 0) return
    onComplete()
  }, [onComplete, remainingMs])

  return (
    <div className="flex items-center justify-between rounded-2xl border border-accent-done/20 bg-surface-success px-4 py-3 text-sm">
      <div>
        <div className="font-semibold text-accent-done">Rest timer running</div>
        <div className="text-text-secondary">{formatRestDuration(seconds)} remaining</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(Date.now(), endAt - 15_000))} className="touch-target rounded-lg p-2 text-text-secondary" aria-label="Subtract 15 seconds"><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={() => onChange(endAt + 15_000)} className="touch-target rounded-lg p-2 text-text-secondary" aria-label="Add 15 seconds"><Plus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={onClear} className="touch-target rounded-lg p-2 text-text-secondary" aria-label="Skip rest timer"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  )
}

export const SetRow = memo(function SetRow({
  set,
  previousSet,
  onUpdateSet,
  onDeleteSet,
  onCompleteSet,
  loggingMode,
  syncState,
}: {
  set: WorkoutSet
  previousSet: WorkoutSet | null
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onCompleteSet: () => void
  loggingMode: LoggingMode
  syncState?: 'pending' | 'failed'
}) {
  const [weightDraft, setWeightDraft] = useState(formatValue(set.weight))
  const [repsDraft, setRepsDraft] = useState(formatValue(set.reps))
  const [durationDraft, setDurationDraft] = useState(formatValue(set.duration_seconds))
  const [assistanceDraft, setAssistanceDraft] = useState(formatValue(set.assistance_weight))
  const [rpeDraft, setRpeDraft] = useState(formatValue(set.rpe))

  useEffect(() => setWeightDraft(formatValue(set.weight)), [set.weight])
  useEffect(() => setRepsDraft(formatValue(set.reps)), [set.reps])
  useEffect(() => setDurationDraft(formatValue(set.duration_seconds)), [set.duration_seconds])
  useEffect(() => setAssistanceDraft(formatValue(set.assistance_weight)), [set.assistance_weight])
  useEffect(() => setRpeDraft(formatValue(set.rpe)), [set.rpe])

  function commitNumber(field: 'weight' | 'reps' | 'duration_seconds' | 'assistance_weight' | 'rpe', draft: string) {
    const currentValue = set[field]
    const currentDraft = formatValue(currentValue)
    const trimmed = draft.trim()

    if (trimmed === currentDraft) return
    if (!trimmed) {
      onUpdateSet(set, { [field]: null })
      return
    }

    const nextValue = Number(trimmed)
    const invalid = !Number.isFinite(nextValue) || nextValue < 0 || ((field === 'reps' || field === 'duration_seconds') && !Number.isInteger(nextValue)) || (field === 'rpe' && (nextValue < 1 || nextValue > 10))
    if (invalid) {
      if (field === 'weight') setWeightDraft(currentDraft)
      else if (field === 'reps') setRepsDraft(currentDraft)
      else if (field === 'duration_seconds') setDurationDraft(currentDraft)
      else if (field === 'assistance_weight') setAssistanceDraft(currentDraft)
      else setRpeDraft(currentDraft)
      return
    }

    onUpdateSet(set, { [field]: nextValue })
  }

  function toggleCompleted() {
    const isCompleting = !set.is_completed
    onUpdateSet(set, {
      is_completed: isCompleting,
      completed_at: isCompleting ? new Date().toISOString() : null,
    })
    if (isCompleting && set.set_type !== 'drop') onCompleteSet()
  }

  const primaryField = loggingMode === 'duration' ? 'duration_seconds' : loggingMode === 'assisted_bodyweight' ? 'assistance_weight' : loggingMode === 'bodyweight_reps' ? 'reps' : 'weight'
  const primaryDraft = primaryField === 'duration_seconds' ? durationDraft : primaryField === 'assistance_weight' ? assistanceDraft : primaryField === 'reps' ? repsDraft : weightDraft
  const setPrimaryDraft = primaryField === 'duration_seconds' ? setDurationDraft : primaryField === 'assistance_weight' ? setAssistanceDraft : primaryField === 'reps' ? setRepsDraft : setWeightDraft
  const showReps = !['duration', 'bodyweight_reps'].includes(loggingMode)

  return (
    <div className={cn('grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 rounded-2xl p-2', set.is_completed ? 'bg-surface-success ring-1 ring-accent-done/25' : 'bg-surface-input')}>
      <div className="flex items-center justify-center text-sm text-text-secondary">{set.set_order + 1}</div>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-surface-card px-2 text-left text-xs text-text-secondary"
        onClick={() => {
          if (!previousSet) return
          const patch: Partial<WorkoutSet> = {}
          if (previousSet.weight !== null) { setWeightDraft(formatValue(previousSet.weight)); patch.weight = previousSet.weight }
          if (previousSet.reps !== null) { setRepsDraft(formatValue(previousSet.reps)); patch.reps = previousSet.reps }
          if (previousSet.duration_seconds !== null) { setDurationDraft(formatValue(previousSet.duration_seconds)); patch.duration_seconds = previousSet.duration_seconds }
          if (previousSet.assistance_weight !== null) { setAssistanceDraft(formatValue(previousSet.assistance_weight)); patch.assistance_weight = previousSet.assistance_weight }
          onUpdateSet(set, patch)
        }}
      >
        {previousSet ? formatPreviousSet(previousSet) : '--'}
      </button>
      <input
        inputMode="decimal"
        className={cn('w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25', !showReps && 'col-span-2')}
        value={primaryDraft}
        placeholder="0"
        aria-label={primaryField.replace('_', ' ')}
        onChange={(event) => setPrimaryDraft(event.target.value)}
        onBlur={() => commitNumber(primaryField, primaryDraft)}
      />
      {showReps ? <input
        inputMode="numeric"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={repsDraft}
        placeholder="0"
        onChange={(event) => setRepsDraft(event.target.value)}
        onBlur={() => commitNumber('reps', repsDraft)}
      /> : null}
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
      <div className="col-span-full grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-xs text-text-secondary">Set type
          <select className="mt-1 w-full rounded-xl border border-white/10 bg-surface-card px-2 py-2 text-sm" value={set.set_type} onChange={(event) => onUpdateSet(set, { set_type: event.target.value as WorkoutSet['set_type'] })}>
            <option value="working">Working</option><option value="warmup">Warm-up</option><option value="failure">Failure</option><option value="drop">Drop</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">Actual RPE
          <input className="mt-1 w-full rounded-xl border border-white/10 bg-surface-card px-2 py-2 text-sm" inputMode="decimal" value={rpeDraft} placeholder="1–10" onChange={(event) => setRpeDraft(event.target.value)} onBlur={() => commitNumber('rpe', rpeDraft)} />
        </label>
        <span className={cn('self-end pb-2 text-xs', syncState === 'failed' ? 'text-accent-danger' : 'text-text-muted')} aria-live="polite">
          {syncState === 'pending' ? 'Saving…' : syncState === 'failed' ? 'Save failed—will retry' : set.is_completed ? 'Saved' : ''}
        </span>
      </div>
      <DeleteTextButton className="touch-target col-span-full justify-end text-text-secondary" label="Delete set" onClick={() => onDeleteSet(set)} />
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
  historicalRecordsByExerciseMode,
}: {
  workout: Workout
  workoutExercises: WorkoutExercise[]
  setsByWorkoutExercise: Map<string, WorkoutSet[]>
  exerciseById: Map<string, Exercise>
  historicalRecordsByExerciseMode: Map<string, ExerciseRecord>
}) {
  const prs: WorkoutPr[] = []
  let totalVolume = 0
  let completedSets = 0

  for (const workoutExercise of workoutExercises) {
    const exercise = exerciseById.get(workoutExercise.exercise_id)
    const workingSets = (setsByWorkoutExercise.get(workoutExercise.id) ?? []).filter(isWorkingSet)
    if (!workingSets.length) continue

    const exerciseVolume = workingSets.reduce((total, set) => total + loadedVolume(set, workoutExercise.logging_mode), 0)
    const maxWeight = Math.max(0, ...workingSets.map((set) => set.weight ?? 0))
    const previous = historicalRecordsByExerciseMode.get(exerciseModeKey(workoutExercise.exercise_id, workoutExercise.logging_mode)) ?? { maxWeight: 0, volume: 0 }
    const exerciseName = exercise?.name ?? 'Exercise'

    totalVolume += exerciseVolume
    completedSets += workingSets.length

    if ((workoutExercise.logging_mode === 'weight_reps' || workoutExercise.logging_mode === 'weighted_bodyweight') && maxWeight > previous.maxWeight) {
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

function playTimerSound(volume = 0.15) {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = 880
  gain.gain.value = Math.min(0.5, Math.max(0, volume))
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.2)
  oscillator.addEventListener('ended', () => void context.close(), { once: true })
}

function formatPreviousSet(set: WorkoutSet): string {
  const effort = set.rpe !== null ? ` @ RPE ${set.rpe}` : ''
  if (set.duration_seconds !== null) return `${set.duration_seconds}s${effort}`
  if (set.assistance_weight !== null) return `${set.assistance_weight} lb assist x ${set.reps ?? '—'}${effort}`
  if (set.weight !== null && set.reps !== null) return `${set.weight} x ${set.reps}${effort}`
  if (set.weight !== null) return `${set.weight} lb${effort}`
  if (set.reps !== null) return `${set.reps} reps${effort}`
  return effort || '--'
}
