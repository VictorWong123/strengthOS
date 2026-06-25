import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3 } from 'lucide-react'
import { MaxWeightProgressChart } from './charts/MaxWeightProgressChart'
import { VolumeProgressChart } from './charts/VolumeProgressChart'
import { WorkoutHeatmap } from './charts/WorkoutHeatmap'
import type { ExerciseSession } from './charts/types'
import { MetricCard, Select, SurfaceCard } from './ui'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'

type AnalyticsPageProps = {
  exercises: Exercise[]
  workouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
}

export function AnalyticsPage({ exercises, workouts, workoutExercises, sets }: AnalyticsPageProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState('')

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])
  const workoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout])), [workouts])
  const setsByWorkoutExerciseId = useMemo(() => groupBy(sets, (set) => set.workout_exercise_id), [sets])

  const workoutDates = useMemo(
    () => workouts.map((workout) => workout.completed_at ?? workout.started_at).filter(Boolean),
    [workouts],
  )

  const exercisesWithHistory = useMemo(() => {
    const ids = new Set<string>()
    for (const item of workoutExercises) {
      const workout = workoutById.get(item.workout_id)
      const itemSets = setsByWorkoutExerciseId.get(item.id) ?? []
      if (workout && itemSets.some(isLiftSet)) ids.add(item.exercise_id)
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
    if (!selectedExerciseId) return []

    return workoutExercises
      .filter((item) => item.exercise_id === selectedExerciseId)
      .map((item): ExerciseSession | null => {
        const workout = workoutById.get(item.workout_id)
        if (!workout) return null

        const itemSets = (setsByWorkoutExerciseId.get(item.id) ?? []).filter(isLiftSet)
        if (!itemSets.length) return null

        const dateValue = workout.completed_at ?? workout.started_at
        const volume = itemSets.reduce((total, set) => total + (set.weight ?? 0) * (set.reps ?? 0), 0)
        const maxWeight = Math.max(...itemSets.map((set) => set.weight ?? 0))

        return {
          date: new Date(dateValue),
          label: new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          volume,
          maxWeight,
        }
      })
      .filter((session): session is ExerciseSession => Boolean(session))
      .sort((left, right) => left.date.getTime() - right.date.getTime())
  }, [selectedExerciseId, setsByWorkoutExerciseId, workoutById, workoutExercises])

  const bestVolume = sessions.reduce<ExerciseSession | null>((best, session) => (!best || session.volume > best.volume ? session : best), null)
  const bestMaxWeight = sessions.reduce<ExerciseSession | null>((best, session) => (!best || session.maxWeight > best.maxWeight ? session : best), null)

  return (
    <div className="space-y-6">
      <WorkoutHeatmap dates={workoutDates} />

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
                label="Best Volume"
                value={bestVolume ? formatNumber(bestVolume.volume) : '0'}
                detail={bestVolume?.label ?? 'No data'}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
              <MetricCard
                label="Max Weight"
                value={bestMaxWeight ? formatWeight(bestMaxWeight.maxWeight) : '0 lb'}
                detail={bestMaxWeight?.label ?? 'No data'}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
            </div>

            <VolumeProgressChart sessions={sessions} />
            <MaxWeightProgressChart sessions={sessions} />
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

function isLiftSet(set: WorkoutSet) {
  return Boolean(set.is_completed && set.weight && set.reps)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatWeight(value: number) {
  return `${formatNumber(value)} lb`
}
