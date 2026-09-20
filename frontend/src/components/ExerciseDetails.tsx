import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { bestCompletedSet, estimatedOneRepMax } from '../lib/performance'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { supabase } from '../lib/supabase'
import { ExerciseMedia } from './ExerciseMedia'
import { TrendChart } from './charts/TrendChart'
import { Badge, IconButton, SecondaryButton, SurfaceCard, Textarea } from './ui'

type Props = {
  exercise: Exercise
  sets: WorkoutSet[]
  workouts: Workout[]
  workoutExercises: WorkoutExercise[]
  open?: boolean
  onClose: () => void
  action?: ReactNode
  onOpenWorkout: (workoutId: string) => void
}

export function ExerciseDetails({ exercise, sets, workouts, workoutExercises, open = true, onClose, action, onOpenWorkout }: Props) {
  const [cue, setCue] = useState('')
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]))
  const workoutExerciseById = new Map(workoutExercises.map((item) => [item.id, item]))
  const completedSets = sets.filter((set) => {
    const item = workoutExerciseById.get(set.workout_exercise_id)
    return item?.logging_mode === exercise.logging_mode && workoutById.get(item.workout_id)?.completed_at
  })
  const bestSet = bestCompletedSet(completedSets, exercise.logging_mode)
  const bestE1rm = bestEstimate(completedSets, exercise.logging_mode)
  const sessions = [...new Set(sets.map((set) => workoutExerciseById.get(set.workout_exercise_id)?.workout_id).filter(Boolean) as string[])]
    .map((workoutId) => {
      const item = workoutExercises.find((candidate) => candidate.workout_id === workoutId && candidate.exercise_id === exercise.id)
      return { workout: workoutById.get(workoutId), mode: item?.logging_mode ?? exercise.logging_mode, sets: sets.filter((set) => set.workout_exercise_id === item?.id && set.is_completed && set.set_type !== 'warmup') }
    })
    .filter((item): item is { workout: Workout; mode: Exercise['logging_mode']; sets: WorkoutSet[] } => Boolean(item.workout?.completed_at && item.sets.length))
    .sort((a, b) => new Date(b.workout.completed_at ?? b.workout.started_at).getTime() - new Date(a.workout.completed_at ?? a.workout.started_at).getTime())
  const repRecords = exercise.logging_mode === 'weight_reps' || exercise.logging_mode === 'weighted_bodyweight'
    ? [...completedSets.filter((set) => set.is_completed && set.set_type !== 'warmup' && set.weight !== null && set.reps !== null).reduce((records, set) => {
        records.set(set.weight as number, Math.max(records.get(set.weight as number) ?? 0, set.reps as number)); return records
      }, new Map<number, number>()).entries()].sort((a, b) => b[0] - a[0]).slice(0, 8)
    : []
  const estimateTrend = sessions
    .filter((session) => session.mode === 'weight_reps')
    .map((session) => ({ label: new Date(session.workout.completed_at ?? session.workout.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: bestEstimate(session.sets, session.mode) }))
    .filter((point): point is { label: string; value: number } => point.value !== null)
    .reverse()

  useEffect(() => {
    void supabase.from('exercise_cues').select('cue').eq('exercise_id', exercise.id).limit(1).then(({ data }) => setCue(data?.[0]?.cue ?? ''))
  }, [exercise.id])

  async function saveCue() {
    const { data } = await supabase.auth.getUser()
    if (!data.user || !cue.trim()) return
    await supabase.from('exercise_cues').upsert({ user_id: data.user.id, exercise_id: exercise.id, cue: cue.trim(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,exercise_id' })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-overlay p-4 pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true">
      <SurfaceCard className="mx-auto max-w-app space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold">{exercise.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
              {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
              {exercise.secondary_muscles.map((muscle) => (
                <Badge key={muscle}>{muscle}</Badge>
              ))}
            </div>
          </div>
          <IconButton aria-label="Close exercise details" variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
        <div className="overflow-hidden rounded-card border border-app-border bg-surface-elevated">
          <ExerciseMedia
            src={[exercise.animation_url, exercise.image_url].filter(Boolean) as string[]}
            alt={`${exercise.name} demonstration`}
            controls
            className="max-h-96 w-full object-contain"
            videoClassName="max-h-96 w-full bg-black object-contain"
            fallback={<div className="flex h-48 items-center justify-center text-sm text-zinc-500">No demonstration available.</div>}
          />
        </div>
        <div>
          <h3 className="font-semibold">Instructions</h3>
          {exercise.instructions.length ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
              {exercise.instructions.map((step, index) => (
                <li key={`${exercise.id}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No instructions are available for this exercise.</p>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Personal cue</h3>
          <Textarea value={cue} onChange={(event) => setCue(event.target.value)} placeholder="Grip, seat, stance, or tempo" />
          <SecondaryButton className="w-full" disabled={!cue.trim()} onClick={() => void saveCue()}>Save cue</SecondaryButton>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Sets" value={String(completedSets.filter((set) => set.is_completed && set.set_type !== 'warmup').length)} />
          <Metric label="Best" value={formatPerformance(bestSet, exercise.logging_mode)} />
          <Metric label="Est. 1RM" value={exercise.logging_mode === 'weight_reps' && bestE1rm ? `${bestE1rm} lb` : '—'} />
        </div>
        {repRecords.length ? <div><h3 className="font-semibold">Rep records by load</h3><div className="mt-2 flex flex-wrap gap-2">{repRecords.map(([weight, reps]) => <Badge key={weight}>{weight} lb × {reps}</Badge>)}</div></div> : null}
        {estimateTrend.length ? <TrendChart title="Estimated 1RM trend" unit="lb" data={estimateTrend} tone="green" /> : null}
        {sessions.length ? <div className="space-y-2"><h3 className="font-semibold">Exercise history</h3>{sessions.slice(0, 12).map(({ workout, mode, sets: sessionSets }) => <button key={workout.id} type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl bg-surface-input px-3 py-2 text-left text-sm" onClick={() => { onClose(); onOpenWorkout(workout.id) }}><span><span className="font-medium">{new Date(workout.completed_at ?? workout.started_at).toLocaleDateString()}</span><span className="ml-2 text-text-muted">{workout.name}</span></span><span>{formatPerformance(bestForMode(sessionSets, mode), mode)}</span></button>)}</div> : null}
        {sessions.length ? <div className="space-y-1 text-xs text-text-muted">{sessions.slice(0, 12).map(({ workout, mode, sets: sessionSets }) => <div key={`sets-${workout.id}`}>{new Date(workout.completed_at ?? workout.started_at).toLocaleDateString()}: {sessionSets.map((set) => formatPerformance(set, mode)).join(', ')}{mode === 'weight_reps' ? ` · est. 1RM ${bestEstimate(sessionSets, mode) ?? '—'} lb` : ''}</div>)}</div> : null}
        {action ? <div className="grid gap-3">{action}</div> : null}
      </SurfaceCard>
    </div>
  )
}

function bestForMode(sets: WorkoutSet[], mode: Exercise['logging_mode']) {
  return [...sets].sort((a, b) => performanceValue(b, mode) - performanceValue(a, mode))[0] ?? null
}

function performanceValue(set: WorkoutSet, mode: Exercise['logging_mode']) {
  if (mode === 'duration') return set.duration_seconds ?? 0
  if (mode === 'assisted_bodyweight') return (set.reps ?? 0) * 10000 - (set.assistance_weight ?? 9999)
  if (mode === 'bodyweight_reps') return set.reps ?? 0
  return (set.weight ?? 0) * 1000 + (set.reps ?? 0)
}

function formatPerformance(set: WorkoutSet | null, mode: Exercise['logging_mode']) {
  if (!set) return '—'
  if (mode === 'duration') return set.duration_seconds === null ? 'Duration unknown' : `${set.duration_seconds}s`
  if (mode === 'assisted_bodyweight') return `${set.reps ?? 0} reps @ ${set.assistance_weight === null ? 'unknown' : set.assistance_weight} lb assist`
  if (mode === 'bodyweight_reps') return set.reps === null ? 'Reps unknown' : `${set.reps} reps`
  const label = mode === 'weighted_bodyweight' ? ' added' : ''
  return `${set.weight === null ? 'Unknown' : `${set.weight} lb${label}`} × ${set.reps ?? 'unknown'} reps`
}

function bestEstimate(sets: WorkoutSet[], mode: Exercise['logging_mode']) {
  const bestSet = bestCompletedSet(sets, mode)
  return bestSet ? estimatedOneRepMax(bestSet, mode) : null
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-button bg-surface-elevated p-3">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
    </div>
  )
}
