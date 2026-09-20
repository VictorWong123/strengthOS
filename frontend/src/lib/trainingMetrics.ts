import type { LoggingMode, WorkoutSet } from './types'

export function exerciseModeKey(exerciseId: string, mode: LoggingMode) {
  return `${exerciseId}:${mode}`
}

export function isWorkingSet(set: WorkoutSet) {
  return set.is_completed && set.set_type !== 'warmup'
}

export function loadedVolume(set: WorkoutSet, mode: LoggingMode) {
  if (!isWorkingSet(set) || !set.reps) return 0
  if (mode !== 'weight_reps') return 0
  return (set.weight ?? 0) * set.reps
}

export function estimatedOneRepMax(set: WorkoutSet, mode: LoggingMode) {
  if (!isWorkingSet(set) || mode !== 'weight_reps' || !set.weight || !set.reps || set.reps > 15) return null
  return Math.round(set.weight * (1 + set.reps / 30) * 100) / 100
}

export function progressionSuggestion(
  sessions: WorkoutSet[][],
  targetReps: string | null,
  targetRpe: number | null,
  increment: number,
  mode: LoggingMode,
  targetSets: number,
) {
  const range = parseRepRange(targetReps)
  if (!range || !targetRpe || sessions.length < 2 || !Number.isFinite(increment) || increment <= 0 || targetSets < 1) return null
  const evidence = sessions.slice(0, 2).map((sets) => sets.filter(isWorkingSet))
  if (evidence.some((sets) => sets.length !== targetSets || sets.some((set) => set.reps === null || set.rpe === null))) return null
  const loadKey = (set: WorkoutSet) => mode === 'assisted_bodyweight' ? set.assistance_weight : set.weight
  const comparableLoad = loadKey(evidence[0][0])
  if (['weight_reps', 'weighted_bodyweight', 'assisted_bodyweight'].includes(mode) && comparableLoad === null) return null
  if (evidence.some((sets) => sets.some((set) => loadKey(set) !== comparableLoad))) return null
  const reachedTop = evidence.every((sets) => sets.every((set) => (set.reps ?? 0) >= range.max && (set.rpe ?? 11) <= targetRpe))
  if (reachedTop) {
    if (mode === 'bodyweight_reps') return 'Repeat target with clean reps.'
    return mode === 'assisted_bodyweight'
      ? (comparableLoad as number) >= increment ? `Decrease assistance by ${increment} lb.` : 'Repeat target with clean reps.'
      : mode === 'duration'
        ? null
        : `Increase load by ${increment} lb.`
  }
  if (evidence[0].some((set) => (set.rpe ?? 0) > targetRpe)) return 'Repeat target and reduce effort before progressing.'
  const belowTop = evidence[0].some((set) => (set.reps ?? 0) < range.max)
  return belowTop ? `Add reps toward ${range.max}.` : 'Repeat target and match effort.'
}

export function calculatePlatesPerSide(target: number, barWeight: number, plates: number[]) {
  if (![target, barWeight, ...plates].every(Number.isFinite) || target < 0 || barWeight < 0 || plates.some((value) => value <= 0)) {
    throw new Error('Plate inputs must be finite positive weights.')
  }
  const capacity = Math.max(0, Math.floor((target - barWeight) * 50))
  let sums = new Map<number, number[]>([[0, []]])
  for (const plate of plates) {
    const units = Math.round(plate * 100)
    const next = new Map(sums)
    for (const [sum, used] of sums) {
      if (sum + units <= capacity && !next.has(sum + units)) next.set(sum + units, [...used, plate])
    }
    sums = next
  }
  const best = Math.max(...sums.keys())
  return { plates: sums.get(best) ?? [], loadedWeight: barWeight + best / 50 }
}

export function warmupSets(target: number, plates = [45, 35, 25, 10, 5, 2.5], barWeight = 45) {
  return [
    { weight: calculatePlatesPerSide(target * 0.4, barWeight, plates).loadedWeight, reps: 8 },
    { weight: calculatePlatesPerSide(target * 0.6, barWeight, plates).loadedWeight, reps: 5 },
    { weight: calculatePlatesPerSide(target * 0.8, barWeight, plates).loadedWeight, reps: 3 },
  ].filter((set, index, sets) => set.weight > 0 && set.weight < target && sets.findIndex((candidate) => candidate.weight === set.weight) === index)
}

function parseRepRange(value: string | null) {
  if (!value) return null
  const match = value.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i) ?? value.match(/(\d+)/)
  if (!match) return null
  const min = Number(match[1])
  const max = Number(match[2] ?? match[1])
  return min > 0 && max >= min ? { min, max } : null
}
