import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3 } from 'lucide-react'
import { MaxWeightProgressChart } from './charts/MaxWeightProgressChart'
import { VolumeProgressChart } from './charts/VolumeProgressChart'
import { WorkoutHeatmap } from './charts/WorkoutHeatmap'
import { TrendChart } from './charts/TrendChart'
import type { ExerciseSession } from './charts/types'
import { MetricCard, Select, SurfaceCard } from './ui'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { isWorkingSet, loadedVolume } from '../lib/trainingMetrics'
import { dateKeyInTimeZone, sundayDateKey } from '../lib/dateTime'

type AnalyticsPageProps = {
  exercises: Exercise[]
  workouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  onSelectWorkoutDate: (date: string) => void
  timeZone: string
}

export function AnalyticsPage({ exercises, workouts, workoutExercises, sets, onSelectWorkoutDate, timeZone }: AnalyticsPageProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState('')

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])
  const workoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout])), [workouts])
  const setsByWorkoutExerciseId = useMemo(() => groupBy(sets, (set) => set.workout_exercise_id), [sets])

  const workoutDates = useMemo(
    () => workouts.map((workout) => workout.completed_at).filter((date): date is string => Boolean(date)),
    [workouts],
  )

  const exercisesWithHistory = useMemo(() => {
    const ids = new Set<string>()
    for (const item of workoutExercises) {
      const workout = workoutById.get(item.workout_id)
      const itemSets = setsByWorkoutExerciseId.get(item.id) ?? []
      if (workout?.completed_at && itemSets.some(isWorkingSet)) ids.add(item.exercise_id)
    }

    return exercises
      .filter((exercise) => ids.has(exercise.id))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [exercises, setsByWorkoutExerciseId, workoutById, workoutExercises])

  useEffect(() => {
    if (selectedExerciseId && exercisesWithHistory.some((exercise) => exercise.id === selectedExerciseId)) return
    setSelectedExerciseId(exercisesWithHistory[0]?.id ?? '')
  }, [exercisesWithHistory, selectedExerciseId])

  const selectedExercise = exerciseById.get(selectedExerciseId) ?? null

  const sessions = useMemo(() => {
    if (!selectedExerciseId || !selectedExercise) return []

    const comparableItems = workoutExercises.filter((item) => item.exercise_id === selectedExerciseId && item.logging_mode === selectedExercise.logging_mode)
    return [...groupBy(comparableItems, (item) => item.workout_id).entries()]
      .map(([workoutId, items]): ExerciseSession | null => {
        const workout = workoutById.get(workoutId)
        if (!workout?.completed_at) return null

        const itemSets = items.flatMap((item) => setsByWorkoutExerciseId.get(item.id) ?? []).filter(isWorkingSet)
        if (!itemSets.length) return null

        const dateValue = workout.completed_at ?? workout.started_at
        const mode = selectedExercise.logging_mode
        const volume = mode === 'duration' ? itemSets.reduce((total, set) => total + (set.duration_seconds ?? 0), 0) : mode === 'bodyweight_reps' || mode === 'assisted_bodyweight' || mode === 'weighted_bodyweight' ? itemSets.reduce((total, set) => total + (set.reps ?? 0), 0) : itemSets.reduce((total, set) => total + loadedVolume(set, mode), 0)
        const knownAssistance = itemSets.flatMap((set) => set.assistance_weight === null ? [] : [set.assistance_weight])
        const knownDurations = itemSets.flatMap((set) => set.duration_seconds === null ? [] : [set.duration_seconds])
        const knownReps = itemSets.flatMap((set) => set.reps === null ? [] : [set.reps])
        const knownWeights = itemSets.flatMap((set) => set.weight === null ? [] : [set.weight])
        const maxWeight = mode === 'duration' ? knownDurations.length ? Math.max(...knownDurations) : null : mode === 'bodyweight_reps' ? knownReps.length ? Math.max(...knownReps) : null : mode === 'assisted_bodyweight' ? knownAssistance.length ? Math.min(...knownAssistance) : null : knownWeights.length ? Math.max(...knownWeights) : null

        return {
          date: new Date(dateValue),
          label: new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone }),
          volume,
          maxWeight,
        }
      })
      .filter((session): session is ExerciseSession => Boolean(session))
      .sort((left, right) => left.date.getTime() - right.date.getTime())
  }, [selectedExercise?.logging_mode, selectedExerciseId, setsByWorkoutExerciseId, timeZone, workoutById, workoutExercises])

  const bestVolume = sessions.reduce<ExerciseSession | null>((best, session) => (!best || session.volume > best.volume ? session : best), null)
  const bestMaxWeight = sessions.reduce<ExerciseSession | null>((best, session) => {
    if (session.maxWeight === null) return best
    if (!best) return session
    if (best.maxWeight === null) return session
    return selectedExercise?.logging_mode === 'assisted_bodyweight'
      ? session.maxWeight < best.maxWeight ? session : best
      : session.maxWeight > best.maxWeight ? session : best
  }, null)
  const muscleWorkload = useMemo(() => {
    const weekStartKey = sundayDateKey(timeZone)
    const previousStartDate = new Date(`${weekStartKey}T00:00:00Z`)
    previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 7)
    const previousStartKey = previousStartDate.toISOString().slice(0, 10)
    const rows = new Map<string, { primary: number; previous: number; secondary: number; workouts: Set<string>; last: number }>()
    for (const exercise of exercises) {
      if (exercise.primary_muscle) rows.set(exercise.primary_muscle, { primary: 0, previous: 0, secondary: 0, workouts: new Set(), last: 0 })
    }
    for (const item of workoutExercises) {
      const workout = workoutById.get(item.workout_id)
      const trainedAt = new Date(workout?.completed_at ?? workout?.started_at ?? 0).getTime()
      const trainedKey = dateKeyInTimeZone(workout?.completed_at ?? workout?.started_at ?? 0, timeZone)
      if (!workout?.completed_at) continue
      const workingSets = (setsByWorkoutExerciseId.get(item.id) ?? []).filter((set) => set.is_completed && set.set_type !== 'warmup').length
      if (!workingSets) continue
      const exercise = exerciseById.get(item.exercise_id)
      const primaryMuscle = exercise?.primary_muscle ?? 'Unknown'
      {
        const row = rows.get(primaryMuscle) ?? { primary: 0, previous: 0, secondary: 0, workouts: new Set<string>(), last: 0 }
        if (trainedKey >= weekStartKey) row.primary += workingSets
        else if (trainedKey >= previousStartKey) row.previous += workingSets
        if (trainedKey >= weekStartKey) row.workouts.add(workout.id)
        row.last = Math.max(row.last, trainedAt)
        rows.set(primaryMuscle, row)
      }
      for (const muscle of exercise?.secondary_muscles ?? []) {
        const row = rows.get(muscle) ?? { primary: 0, previous: 0, secondary: 0, workouts: new Set<string>(), last: 0 }
        if (trainedKey >= weekStartKey) row.secondary += workingSets
        if (trainedKey >= weekStartKey) row.workouts.add(workout.id)
        row.last = Math.max(row.last, trainedAt)
        rows.set(muscle, row)
      }
    }
    return [...rows.entries()].sort((a, b) => b[1].primary - a[1].primary || a[0].localeCompare(b[0]))
  }, [exerciseById, exercises, setsByWorkoutExerciseId, timeZone, workoutById, workoutExercises])

  return (
    <div className="space-y-6">
      <WorkoutHeatmap dates={workoutDates} onSelectDate={onSelectWorkoutDate} timeZone={timeZone} />

      <SurfaceCard className="space-y-4">
        <div><h2 className="text-xl font-semibold">Weekly muscle workload</h2><p className="mt-1 text-sm text-text-secondary">Completed working sets; secondary involvement shown separately.</p></div>
        <div className="space-y-2">
          {muscleWorkload.map(([muscle, row]) => (
            <div key={muscle} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-surface-input px-3 py-2 text-sm">
              <div><span className="font-medium">{muscle}</span><span className="ml-2 text-text-muted">{row.workouts.size} session{row.workouts.size === 1 ? '' : 's'}</span></div>
              <span className={row.primary ? 'text-text-primary' : 'text-text-muted'}>{row.primary} primary · {row.secondary} secondary</span>
              <span className="col-span-full text-xs text-text-muted">Previous week {row.previous} · {row.last ? `last trained ${new Date(row.last).toLocaleDateString(undefined, { timeZone })}` : 'never trained'}</span>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Exercise Progress</h2>
            <p className="mt-1 text-sm text-text-secondary">{selectedExercise ? selectedExercise.name : 'No logged lifts yet'}</p>
          </div>
          <Activity className="mt-1 h-5 w-5 text-accent-blue" aria-hidden="true" />
        </div>

        {exercisesWithHistory.length ? (
          <>
            <Select value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)} aria-label="Exercise">
              {exercisesWithHistory.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label={selectedExercise?.logging_mode === 'duration' ? 'Most time' : selectedExercise?.logging_mode === 'bodyweight_reps' || selectedExercise?.logging_mode === 'assisted_bodyweight' || selectedExercise?.logging_mode === 'weighted_bodyweight' ? 'Most reps' : 'Best Volume'}
                value={bestVolume ? formatNumber(bestVolume.volume) : '0'}
                detail={bestVolume?.label ?? 'No data'}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
              <MetricCard
                label={selectedExercise?.logging_mode === 'duration' ? 'Longest set' : selectedExercise?.logging_mode === 'bodyweight_reps' ? 'Rep record' : selectedExercise?.logging_mode === 'assisted_bodyweight' ? 'Least assistance' : 'Max Weight'}
                value={bestMaxWeight?.maxWeight == null ? '—' : formatMetric(bestMaxWeight.maxWeight, selectedExercise?.logging_mode ?? 'weight_reps')}
                detail={bestMaxWeight?.label ?? 'No data'}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
            </div>

            {selectedExercise?.logging_mode === 'weight_reps' ? <><VolumeProgressChart sessions={sessions} /><MaxWeightProgressChart sessions={sessions} /></> : selectedExercise?.logging_mode === 'weighted_bodyweight' ? <TrendChart title="Added load trend" unit="lb added" data={knownPerformancePoints(sessions)} tone="blue" /> : <TrendChart title="Performance trend" unit={selectedExercise?.logging_mode === 'duration' ? 'sec' : selectedExercise?.logging_mode === 'assisted_bodyweight' ? 'lb assist' : 'reps'} data={knownPerformancePoints(sessions)} tone="blue" />}
          </>
        ) : (
          <div className="rounded-card border border-white/10 bg-surface-input p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-card">
              <BarChart3 className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-lg font-semibold">No lift history</h3>
            <p className="mt-1 text-sm text-text-secondary">Complete sets with weight and reps to build exercise analytics.</p>
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return map
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatWeight(value: number) {
  return `${formatNumber(value)} lb`
}

function formatMetric(value: number, mode: Exercise['logging_mode']) {
  if (mode === 'duration') return `${formatNumber(value)} sec`
  if (mode === 'bodyweight_reps') return `${formatNumber(value)} reps`
  if (mode === 'assisted_bodyweight') return `${formatNumber(value)} lb assist`
  return formatWeight(value)
}

function knownPerformancePoints(sessions: ExerciseSession[]) {
  return sessions.flatMap((session) => session.maxWeight === null ? [] : [{ label: session.label, value: session.maxWeight }])
}
