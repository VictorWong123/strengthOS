import type { WorkoutSet } from './types'

export function estimatedOneRepMax(set: WorkoutSet): number | null {
  if (!set.weight || !set.reps || set.reps <= 0) return null
  return Math.round(Number(set.weight) * (1 + set.reps / 30))
}

export function bestCompletedSet(sets: WorkoutSet[]): WorkoutSet | null {
  const completed = sets.filter((set) => set.is_completed && set.weight && set.reps)
  return completed.sort((a, b) => (estimatedOneRepMax(b) ?? 0) - (estimatedOneRepMax(a) ?? 0))[0] ?? null
}
