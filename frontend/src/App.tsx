import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut } from 'lucide-react'
import { AuthView } from './components/AuthView'
import { ExerciseDetails } from './components/ExerciseDetails'
import { ExercisePicker } from './components/ExercisePicker'
import { WorkoutLogger } from './components/WorkoutLogger'
import { Button, Card, GhostButton } from './components/ui'
import { supabase } from './lib/supabase'
import type { Exercise, Routine, Workout, WorkoutExercise, WorkoutSet } from './lib/types'

const EXERCISE_COLUMNS =
  'id, external_id, source, user_id, name, normalized_name, primary_muscle, secondary_muscles, body_part, equipment, movement_category, instructions, image_url, animation_url, thumbnail_url, is_custom, is_active'
const WORKOUT_COLUMNS = 'id, user_id, name, started_at, completed_at, notes'
const WORKOUT_EXERCISE_COLUMNS = 'id, workout_id, exercise_id, exercise_order'
const WORKOUT_SET_COLUMNS = 'id, workout_exercise_id, set_order, reps, weight, is_completed, notes, completed_at'
const ROUTINE_COLUMNS = 'id, user_id, name, notes'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [selectedExerciseSets, setSelectedExerciseSets] = useState<WorkoutSet[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [status, setStatus] = useState('')

  const activeWorkout = useMemo(() => workouts.find((workout) => !workout.completed_at) ?? null, [workouts])
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])
  const workoutExerciseById = useMemo(
    () => new Map(workoutExercises.map((item) => [item.id, item])),
    [workoutExercises],
  )
  const workoutExercisesByWorkoutId = useMemo(() => {
    const grouped = new Map<string, WorkoutExercise[]>()
    for (const item of workoutExercises) {
      const items = grouped.get(item.workout_id) ?? []
      items.push(item)
      grouped.set(item.workout_id, items)
    }
    return grouped
  }, [workoutExercises])
  const setsByWorkoutExerciseId = useMemo(() => {
    const grouped = new Map<string, WorkoutSet[]>()
    for (const set of sets) {
      const itemSets = grouped.get(set.workout_exercise_id) ?? []
      itemSets.push(set)
      grouped.set(set.workout_exercise_id, itemSets)
    }
    return grouped
  }, [sets])
  const activeWorkoutExercises = useMemo(
    () => (activeWorkout ? workoutExercisesByWorkoutId.get(activeWorkout.id) ?? [] : []),
    [activeWorkout, workoutExercisesByWorkoutId],
  )
  const activeWorkoutSets = useMemo(
    () => activeWorkoutExercises.flatMap((item) => setsByWorkoutExerciseId.get(item.id) ?? []),
    [activeWorkoutExercises, setsByWorkoutExerciseId],
  )
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void loadData()
  }, [session])

  useEffect(() => {
    if (!selectedExercise) {
      setSelectedExerciseSets([])
      return
    }
    void loadExerciseHistory(selectedExercise.id)
  }, [selectedExercise])

  async function loadData() {
    setStatus('Loading data...')
    const [
      { data: exerciseRows, error: exerciseError },
      { data: workoutRows, error: workoutError },
      { data: routineRows, error: routineError },
    ] = await Promise.all([
        supabase.from('exercises').select(EXERCISE_COLUMNS).eq('is_active', true).order('name'),
        supabase.from('workouts').select(WORKOUT_COLUMNS).order('started_at', { ascending: false }).limit(10),
        supabase.from('routines').select(ROUTINE_COLUMNS).order('created_at', { ascending: false }),
      ])
    const loadError = exerciseError ?? workoutError ?? routineError
    if (loadError) {
      setStatus(loadError.message)
      return
    }
    setExercises((exerciseRows ?? []) as Exercise[])
    const loadedWorkouts = (workoutRows ?? []) as Workout[]
    setWorkouts(loadedWorkouts)
    setRoutines((routineRows ?? []) as Routine[])
    const childrenLoaded = await loadWorkoutChildren(loadedWorkouts)
    if (childrenLoaded) setStatus('')
  }

  async function loadWorkoutChildren(loadedWorkouts = workouts): Promise<boolean> {
    const workoutIds = loadedWorkouts.map((workout) => workout.id)
    if (!workoutIds.length) {
      setWorkoutExercises([])
      setSets([])
      return true
    }

    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_exercises')
      .select(WORKOUT_EXERCISE_COLUMNS)
      .in('workout_id', workoutIds)
      .order('exercise_order')

    if (exerciseError) {
      setStatus(exerciseError.message)
      return false
    }

    const loadedWorkoutExercises = (exerciseRows ?? []) as WorkoutExercise[]
    setWorkoutExercises(loadedWorkoutExercises)

    const workoutExerciseIds = loadedWorkoutExercises.map((item) => item.id)
    if (!workoutExerciseIds.length) {
      setSets([])
      return true
    }

    const { data: setRows, error: setError } = await supabase
      .from('workout_sets')
      .select(WORKOUT_SET_COLUMNS)
      .in('workout_exercise_id', workoutExerciseIds)
      .order('set_order')

    if (setError) {
      setStatus(setError.message)
      return false
    }

    setSets((setRows ?? []) as WorkoutSet[])
    return true
  }

  async function loadExerciseHistory(exerciseId: string): Promise<void> {
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_exercises')
      .select(WORKOUT_EXERCISE_COLUMNS)
      .eq('exercise_id', exerciseId)

    if (exerciseError) {
      setStatus(exerciseError.message)
      return
    }

    const workoutExerciseIds = ((exerciseRows ?? []) as WorkoutExercise[]).map((item) => item.id)
    if (!workoutExerciseIds.length) {
      setSelectedExerciseSets([])
      return
    }

    const { data: setRows, error: setError } = await supabase
      .from('workout_sets')
      .select(WORKOUT_SET_COLUMNS)
      .in('workout_exercise_id', workoutExerciseIds)
      .order('completed_at', { ascending: false })

    if (setError) {
      setStatus(setError.message)
      return
    }

    setSelectedExerciseSets((setRows ?? []) as WorkoutSet[])
  }

  async function createWorkout(): Promise<Workout | null> {
    if (!session) return null
    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: session.user.id, name: 'Workout' })
      .select(WORKOUT_COLUMNS)
      .single()
    if (error) {
      setStatus(error.message)
      return null
    }
    const workout = data as Workout
    setWorkouts((current) => [workout, ...current])
    return workout
  }

  async function ensureActiveWorkout(): Promise<Workout | null> {
    return activeWorkout ?? createWorkout()
  }

  async function addExerciseToWorkout(exercise: Exercise) {
    const workout = await ensureActiveWorkout()
    if (!workout) return

    const { data, error } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workout.id,
        exercise_id: exercise.id,
        exercise_order: workoutExercisesByWorkoutId.get(workout.id)?.length ?? 0,
      })
      .select(WORKOUT_EXERCISE_COLUMNS)
      .single()
    if (error) {
      setStatus(error.message)
      return
    }
    setWorkoutExercises((current) => [...current, data as WorkoutExercise])
    await addSet((data as WorkoutExercise).id, exercise.id)
  }

  async function addSet(workoutExerciseId: string, exerciseId?: string) {
    const setOrder = setsByWorkoutExerciseId.get(workoutExerciseId)?.length ?? 0
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({ workout_exercise_id: workoutExerciseId, set_order: setOrder })
      .select(WORKOUT_SET_COLUMNS)
      .single()
    if (error) {
      setStatus(error.message)
      return
    }
    const newSet = data as WorkoutSet
    setSets((current) => [...current, newSet])
    const linkedExerciseId = exerciseId ?? workoutExerciseById.get(workoutExerciseId)?.exercise_id
    if (linkedExerciseId === selectedExercise?.id) {
      setSelectedExerciseSets((current) => [...current, newSet])
    }
  }

  async function updateSet(set: WorkoutSet, patch: Partial<WorkoutSet>) {
    const next = { ...set, ...patch }
    setSets((current) => current.map((candidate) => (candidate.id === set.id ? next : candidate)))
    setSelectedExerciseSets((current) => current.map((candidate) => (candidate.id === set.id ? next : candidate)))
    const { error } = await supabase.from('workout_sets').update(patch).eq('id', set.id)
    if (error) {
      setSets((current) => current.map((candidate) => (candidate.id === set.id ? set : candidate)))
      setSelectedExerciseSets((current) => current.map((candidate) => (candidate.id === set.id ? set : candidate)))
      setStatus(error.message)
    }
  }

  async function deleteSet(set: WorkoutSet) {
    setSets((current) => current.filter((candidate) => candidate.id !== set.id))
    setSelectedExerciseSets((current) => current.filter((candidate) => candidate.id !== set.id))
    const { error } = await supabase.from('workout_sets').delete().eq('id', set.id)
    if (error) {
      setSets((current) =>
        current.some((candidate) => candidate.id === set.id) ? current : [...current, set].sort((a, b) => a.set_order - b.set_order),
      )
      setSelectedExerciseSets((current) =>
        current.some((candidate) => candidate.id === set.id) ? current : [...current, set].sort((a, b) => a.set_order - b.set_order),
      )
      setStatus(error.message)
    }
  }

  async function addToRoutine(exercise: Exercise) {
    if (!session) return
    let routine = routines[0]
    if (!routine) {
      const { data, error } = await supabase
        .from('routines')
        .insert({ user_id: session.user.id, name: 'Default routine' })
        .select(ROUTINE_COLUMNS)
        .single()
      if (error) {
        setStatus(error.message)
        return
      }
      routine = data as Routine
      setRoutines([routine])
    }
    const { error } = await supabase.from('routine_exercises').insert({
      routine_id: routine.id,
      exercise_id: exercise.id,
      exercise_order: 0,
    })
    setStatus(error ? error.message : `${exercise.name} added to ${routine.name}.`)
  }

  if (!session) return <AuthView />

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl gap-4 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-[1.1fr_0.9fr]">
      <header className="md:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">strengthOS</h1>
            <p className="text-sm text-gray-400">Supabase-backed workout tracking for focused training logs.</p>
          </div>
          <GhostButton onClick={() => supabase.auth.signOut()} aria-label="Sign out">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign out
          </GhostButton>
        </div>
      </header>
      {status ? <div className="md:col-span-2 rounded-lg bg-surface-elevated p-3 text-sm text-gray-300">{status}</div> : null}
      <section className="space-y-4">
        <WorkoutLogger
          workout={activeWorkout}
          workoutExercises={activeWorkoutExercises}
          sets={activeWorkoutSets}
          exerciseById={exerciseById}
          onCreateWorkout={createWorkout}
          onAddSet={addSet}
          onUpdateSet={updateSet}
          onDeleteSet={deleteSet}
        />
        <Card>
          <h2 className="text-lg font-semibold">Routines</h2>
          <div className="mt-3 space-y-2">
            {routines.length ? routines.map((routine) => (
              <div key={routine.id} className="rounded-lg bg-surface-input p-3">
                <div className="font-medium">{routine.name}</div>
                <div className="text-sm text-gray-400">{routine.notes ?? 'Ready for exercise templates.'}</div>
              </div>
            )) : <p className="text-sm text-gray-400">Add an exercise to create your first routine.</p>}
          </div>
        </Card>
      </section>
      <ExercisePicker exercises={exercises} onSelect={addExerciseToWorkout} onOpenDetails={setSelectedExercise} />
      {selectedExercise ? (
        <ExerciseDetails
          exercise={selectedExercise}
          sets={selectedExerciseSets}
          onClose={() => setSelectedExercise(null)}
          onAddToWorkout={() => addExerciseToWorkout(selectedExercise)}
          onAddToRoutine={() => addToRoutine(selectedExercise)}
        />
      ) : null}
      <div className="fixed bottom-4 right-4 md:hidden">
        <Button onClick={loadData}>Refresh</Button>
      </div>
    </main>
  )
}
