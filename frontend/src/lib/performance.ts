import type { LoggingMode, WorkoutSet } from './types'

export function estimatedOneRepMax(set: WorkoutSet, mode: LoggingMode = 'weight_reps'): number | null {
  if (mode !== 'weight_reps' || !set.weight || !set.reps || set.reps <= 0 || set.reps > 15) return null
  return Math.round(Number(set.weight) * (1 + set.reps / 30))
}

export function bestCompletedSet(sets: WorkoutSet[], mode: LoggingMode = 'weight_reps'): WorkoutSet | null {
  const completed = sets.filter((set) => set.is_completed && set.set_type !== 'warmup')
  const score = (set: WorkoutSet) => mode === 'duration' ? set.duration_seconds ?? 0 : mode === 'assisted_bodyweight' ? (set.reps ?? 0) * 10000 - (set.assistance_weight ?? 9999) : mode === 'bodyweight_reps' ? set.reps ?? 0 : mode === 'weighted_bodyweight' ? (set.weight ?? 0) * 1000 + (set.reps ?? 0) : estimatedOneRepMax(set, mode) ?? 0
  return completed.sort((a, b) => score(b) - score(a))[0] ?? null
}
