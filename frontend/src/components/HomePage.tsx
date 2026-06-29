import { CalendarDays, ChevronRight, Dumbbell, Trophy, UserRound } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { BottomSheet, IconButton, MetricCard, MobileHeader, SurfaceCard } from './ui'

type WeeklySummary = {
  workoutCount: number
  poundsLifted: number
  exercisesCompleted: number
  biggestPrExercise: string
}

type HomePageProps = {
  banners: ReactNode
  completedWorkouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  weeklySummary: WeeklySummary
  onOpenProfile: () => void
}

type WorkoutDetail = {
  exercise: Exercise | null
  sets: WorkoutSet[]
}

export function HomePage({
  banners,
  completedWorkouts,
  workoutExercises,
  sets,
  exerciseById,
  weeklySummary,
  onOpenProfile,
}: HomePageProps) {
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)
  const recentWorkouts = completedWorkouts.slice(0, 5)
  const selectedWorkoutDetails = useWorkoutDetails(selectedWorkout, workoutExercises, sets, exerciseById)

  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-4xl font-bold tracking-tight">Home</h1>}
        rightAction={
          <IconButton aria-label="Open profile" onClick={onOpenProfile}>
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
      />
      {banners}
      <SurfaceCard>
        <h2 className="text-xl font-semibold">Weekly Summary</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="Workouts" value={String(weeklySummary.workoutCount)} />
          <MetricCard label="Pounds Lifted" value={formatNumber(weeklySummary.poundsLifted)} />
          <MetricCard label="Exercises" value={String(weeklySummary.exercisesCompleted)} />
          <MetricCard label="Biggest PR" value={weeklySummary.biggestPrExercise} />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-0">
        <div className="p-4">
          <h2 className="text-xl font-semibold">Recent Workouts</h2>
          {recentWorkouts.length ? (
            <div className="mt-3 divide-y divide-white/10">
              {recentWorkouts.map((workout) => (
                <RecentWorkoutRow
                  key={workout.id}
                  workout={workout}
                  workoutExercises={workoutExercises}
                  sets={sets}
                  exerciseById={exerciseById}
                  onSelect={setSelectedWorkout}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">Finish a workout to see it here.</p>
          )}
        </div>
      </SurfaceCard>

      <BottomSheet
        open={Boolean(selectedWorkout)}
        onClose={() => setSelectedWorkout(null)}
        title={selectedWorkout?.name || 'Workout'}
        description={selectedWorkout ? formatWorkoutDate(selectedWorkout) : undefined}
        className="h-[min(78dvh,720px)]"
        position="top"
      >
        <WorkoutDetails details={selectedWorkoutDetails} />
      </BottomSheet>
    </div>
  )
}

function RecentWorkoutRow({
  workout,
  workoutExercises,
  sets,
  exerciseById,
  onSelect,
}: {
  workout: Workout
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  onSelect: (workout: Workout) => void
}) {
  const details = useWorkoutDetails(workout, workoutExercises, sets, exerciseById)

  return (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-4 py-3 text-left transition first:pt-0 last:pb-0 active:bg-surface-elevated"
      onClick={() => onSelect(workout)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{workout.name || 'Workout'}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatWorkoutDate(workout)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            {details.length} exercises
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{summarizeWorkout(details)}</p>
      </div>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
    </button>
  )
}

function useWorkoutDetails(
  workout: Workout | null,
  workoutExercises: WorkoutExercise[],
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
) {
  return useMemo(() => {
    if (!workout) return []
    return workoutExercises
      .filter((item) => item.workout_id === workout.id)
      .sort((left, right) => left.exercise_order - right.exercise_order)
      .map((item): WorkoutDetail => ({
        exercise: exerciseById.get(item.exercise_id) ?? null,
        sets: sets
          .filter((set) => set.workout_exercise_id === item.id)
          .sort((left, right) => left.set_order - right.set_order),
      }))
  }, [exerciseById, sets, workout, workoutExercises])
}

function WorkoutDetails({ details }: { details: WorkoutDetail[] }) {
  const completedSets = details.flatMap((detail) => detail.sets.filter((set) => set.is_completed))
  const totalVolume = completedSets.reduce((total, set) => total + (set.weight ?? 0) * (set.reps ?? 0), 0)

  if (!details.length) {
    return <p className="rounded-card bg-surface-input p-4 text-sm text-text-secondary">No exercises were logged for this workout.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Completed Sets" value={String(completedSets.length)} />
        <MetricCard label="Volume" value={formatNumber(totalVolume)} />
      </div>
      <div className="space-y-3">
        {details.map((detail, index) => (
          <div key={`${detail.exercise?.id ?? 'unknown'}-${index}`} className="rounded-card border border-white/10 bg-surface-input p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{detail.exercise?.name ?? 'Unknown exercise'}</h3>
                <p className="mt-1 text-xs text-text-muted">{detail.exercise?.equipment ?? 'No equipment'}</p>
              </div>
              <Trophy className="h-4 w-4 shrink-0 text-accent-blue" aria-hidden="true" />
            </div>
            <div className="mt-3 space-y-2">
              {detail.sets.length ? (
                detail.sets.map((set) => (
                  <div key={set.id} className="grid grid-cols-[48px_1fr] gap-2 text-sm">
                    <span className="text-text-muted">Set {set.set_order}</span>
                    <span className="text-text-secondary">{formatSet(set)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-secondary">No sets logged.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function summarizeWorkout(details: WorkoutDetail[]) {
  const names = details.map((detail) => detail.exercise?.name).filter(Boolean)
  if (!names.length) return 'No exercises logged.'
  return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')
}

function formatSet(set: WorkoutSet) {
  const status = set.is_completed ? '' : ' planned'
  if (set.weight && set.reps) return `${formatNumber(set.weight)} lb x ${set.reps}${status}`
  if (set.reps) return `${set.reps} reps${status}`
  return set.is_completed ? 'Completed' : 'Not completed'
}

function formatWorkoutDate(workout: Workout) {
  return new Date(workout.completed_at ?? workout.started_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
