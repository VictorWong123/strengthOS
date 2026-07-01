import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../../lib/types'

export type ExerciseRecord = {
  maxWeight: number
  volume: number
}

export type WorkoutPr = {
  exerciseName: string
  kind: 'Max Weight' | 'Volume'
  value: number
  previous: number
  unit: string
}

export function formatRestDuration(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(normalizedSeconds / 60)
  const seconds = normalizedSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

export function formatValue(value: number | null): string {
  return value === null ? '' : String(value)
}

export function formatPreviousSet(set: WorkoutSet): string {
  if (set.weight !== null && set.reps !== null) return `${set.weight} x ${set.reps}`
  if (set.reps !== null) return `${set.reps} reps`
  return '--'
}

export function buildLiveWorkoutSummary(sets: WorkoutSet[]) {
  let completedSets = 0
  let totalVolume = 0

  for (const set of sets) {
    if (!set.is_completed) continue
    completedSets += 1
    totalVolume += (set.weight ?? 0) * (set.reps ?? 0)
  }

  return { completedSets, totalVolume }
}

export function buildWorkoutSummary({
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
