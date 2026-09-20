import type { ReactNode } from 'react'
import type { Exercise, ExerciseSessionEvidence, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { WorkoutLogger } from './WorkoutLogger'
import { MobileHeader } from './ui'

type ExerciseRecord = {
  maxWeight: number
  volume: number
}

type ActiveWorkoutPageProps = {
  banners: ReactNode
  isLoading: boolean
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

export function ActiveWorkoutPage({
  banners,
  isLoading,
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
}: ActiveWorkoutPageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">Active Workout</h1>}
        subtitle="Log sets and track rest."
      />
      {banners}
      <WorkoutLogger
        isLoading={isLoading}
        workout={workout}
        workoutExercises={workoutExercises}
        sets={sets}
        exerciseById={exerciseById}
        previousSetsByExerciseId={previousSetsByExerciseId}
        previousSessionsByExerciseMode={previousSessionsByExerciseMode}
        previousSessionNoteByExerciseId={previousSessionNoteByExerciseId}
        historicalRecordsByExerciseMode={historicalRecordsByExerciseMode}
        onCreateWorkout={onCreateWorkout}
        onOpenExercisePicker={onOpenExercisePicker}
        onOpenExerciseDetails={onOpenExerciseDetails}
        onAddSet={onAddSet}
        onAddWarmups={onAddWarmups}
        onReplaceExercise={onReplaceExercise}
        onRemoveExercise={onRemoveExercise}
        onMoveExercise={onMoveExercise}
        onUpdateWorkoutExercise={onUpdateWorkoutExercise}
        onUpdateSet={onUpdateSet}
        onDeleteSet={onDeleteSet}
        onFinishWorkout={onFinishWorkout}
        onDiscardWorkout={onDiscardWorkout}
        onUpdateWorkout={onUpdateWorkout}
        setSyncState={setSyncState}
        prAlertsEnabled={prAlertsEnabled}
        onTogglePrAlerts={onTogglePrAlerts}
      />
    </div>
  )
}
