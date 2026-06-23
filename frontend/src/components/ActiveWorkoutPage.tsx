import type { ReactNode } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { WorkoutLogger } from './WorkoutLogger'
import { MobileHeader } from './ui'

type ExerciseRecord = {
  maxWeight: number
  volume: number
}

type ActiveWorkoutPageProps = {
  banners: ReactNode
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

export function ActiveWorkoutPage({
  banners,
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
}: ActiveWorkoutPageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">Active Workout</h1>}
        subtitle="Keep logging. Progress saves to the existing workout tables."
      />
      {banners}
      <WorkoutLogger
        workout={workout}
        workoutExercises={workoutExercises}
        sets={sets}
        exerciseById={exerciseById}
        previousSetsByExerciseId={previousSetsByExerciseId}
        historicalRecordsByExerciseId={historicalRecordsByExerciseId}
        onCreateWorkout={onCreateWorkout}
        onOpenExercisePicker={onOpenExercisePicker}
        onOpenExerciseDetails={onOpenExerciseDetails}
        onAddSet={onAddSet}
        onUpdateSet={onUpdateSet}
        onDeleteSet={onDeleteSet}
        onFinishWorkout={onFinishWorkout}
        onDiscardWorkout={onDiscardWorkout}
        onUpdateWorkout={onUpdateWorkout}
      />
    </div>
  )
}
