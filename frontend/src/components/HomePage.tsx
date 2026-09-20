import { UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { WorkoutDetails, WorkoutSummaryRow, formatWorkoutDate, getWorkoutDetails, useWorkoutDetails } from './WorkoutHistoryUI'
import { BottomSheet, GhostButton, IconButton, MetricCard, MobileHeader, SurfaceCard } from './ui'

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
  onOpenHistory: () => void
}

export function HomePage({
  banners,
  completedWorkouts,
  workoutExercises,
  sets,
  exerciseById,
  weeklySummary,
  onOpenProfile,
  onOpenHistory,
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Recent Workouts</h2>
            <GhostButton className="min-h-11 px-3 py-2 text-sm" onClick={onOpenHistory}>See all</GhostButton>
          </div>
          {recentWorkouts.length ? (
            <div className="mt-3 divide-y divide-white/10">
              {recentWorkouts.map((workout) => (
                <WorkoutSummaryRow
                  key={workout.id}
                  workout={workout}
                  details={getWorkoutDetails(workout, workoutExercises, sets, exerciseById)}
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
        <WorkoutDetails workout={selectedWorkout} details={selectedWorkoutDetails} />
      </BottomSheet>
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
