import { useEffect, useMemo, useState } from 'react'
import { Dumbbell, Plus } from 'lucide-react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PrimaryButton,
  SecondaryButton,
  SurfaceCard,
  Textarea,
  TimerSettingButton,
} from './ui'
import { ActiveWorkoutExerciseCard } from './workout/ActiveWorkoutExerciseCard'
import { FinishWorkoutSheet } from './workout/FinishWorkoutSheet'
import { RestDurationSheet } from './workout/RestDurationSheet'
import { WorkoutStatusBar } from './workout/WorkoutStatusBar'
import { buildLiveWorkoutSummary, formatRestDuration, type ExerciseRecord } from './workout/workoutSummary'

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

const DEFAULT_REST_SECONDS = 90
const REST_TIMER_STORAGE_KEY = 'strengthos:workout-rest-seconds'

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

  const liveSummary = buildLiveWorkoutSummary(sets)

  return (
    <div className="space-y-5">
      <WorkoutStatusBar
        startedAt={workout.started_at}
        restEndAt={restEndAt}
        completedSets={liveSummary.completedSets}
        totalVolume={liveSummary.totalVolume}
        onClearRest={() => setRestEndAt(null)}
      />

      <header className="grid gap-4">
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

      <div className="flex gap-3 pt-1">
        <SecondaryButton className="flex-1" onClick={onOpenExercisePicker}>
          Add Exercise
        </SecondaryButton>
        <PrimaryButton className="flex-1" onClick={() => setIsFinishSheetOpen(true)}>
          Finish Workout
        </PrimaryButton>
      </div>

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

function loadWorkoutRestSeconds(): number {
  const stored = localStorage.getItem(REST_TIMER_STORAGE_KEY)
  const parsed = stored ? Number(stored) : DEFAULT_REST_SECONDS
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_REST_SECONDS
}
