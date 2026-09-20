import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { AnalyticsPage } from './AnalyticsPage'
import { ErrorState, MobileHeader, SecondaryButton } from './ui'

type AnalyticsRoutePageProps = {
  banners: ReactNode
  exercises: Exercise[]
  workouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  isLoading: boolean
  loadError: string | null
  onRetry: () => void
  onSelectWorkoutDate: (date: string) => void
  timeZone: string
}

export function AnalyticsRoutePage({
  banners,
  exercises,
  workouts,
  workoutExercises,
  sets,
  isLoading,
  loadError,
  onRetry,
  onSelectWorkoutDate,
  timeZone,
}: AnalyticsRoutePageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">Analytics</h1>}
        subtitle="Workout frequency and exercise progression."
      />
      {banners}
      {loadError && !isLoading ? (
        <ErrorState
          icon={AlertTriangle}
          title="Unable to load analytics"
          description={loadError}
          action={<SecondaryButton onClick={onRetry}>Retry</SecondaryButton>}
        />
      ) : (
        <AnalyticsPage exercises={exercises} workouts={workouts} workoutExercises={workoutExercises} sets={sets} onSelectWorkoutDate={onSelectWorkoutDate} timeZone={timeZone} />
      )}
    </div>
  )
}
