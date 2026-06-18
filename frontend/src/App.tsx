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

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [status, setStatus] = useState('')

  const activeWorkout = workouts.find((workout) => !workout.completed_at) ?? null
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])

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

  async function loadData() {
    setStatus('Loading data...')
    const [
      { data: exerciseRows, error: exerciseError },
      { data: workoutRows, error: workoutError },
      { data: routineRows, error: routineError },
    ] = await Promise.all([
        supabase.from('exercises').select('*').eq('is_active', true).order('name'),
        supabase.from('workouts').select('*').order('started_at', { ascending: false }).limit(10),
        supabase.from('routines').select('*').order('created_at', { ascending: false }),
      ])
    const loadError = exerciseError ?? workoutError ?? routineError
    if (loadError) {
      setStatus(loadError.message)
      return
    }
    setExercises((exerciseRows ?? []) as Exercise[])
    setWorkouts((workoutRows ?? []) as Workout[])
    setRoutines((routineRows ?? []) as Routine[])
    const childrenLoaded = await loadWorkoutChildren()
    if (childrenLoaded) setStatus('')
  }

  async function loadWorkoutChildren(): Promise<boolean> {
    const [{ data: exerciseRows, error: exerciseError }, { data: setRows, error: setError }] = await Promise.all([
      supabase.from('workout_exercises').select('*').order('exercise_order'),
      supabase.from('workout_sets').select('*').order('set_order'),
    ])
    const loadError = exerciseError ?? setError
    if (loadError) {
      setStatus(loadError.message)
      return false
    }
    setWorkoutExercises((exerciseRows ?? []) as WorkoutExercise[])
    setSets((setRows ?? []) as WorkoutSet[])
    return true
  }

  async function createWorkout() {
    if (!session) return
    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: session.user.id, name: 'Workout' })
      .select()
      .single()
    if (error) {
      setStatus(error.message)
      return
    }
    setWorkouts([data as Workout, ...workouts])
  }

  async function addExerciseToWorkout(exercise: Exercise) {
    let workout = activeWorkout
    if (!workout) {
      if (!session) return
      const { data, error } = await supabase
        .from('workouts')
        .insert({ user_id: session.user.id, name: 'Workout' })
        .select()
        .single()
      if (error) {
        setStatus(error.message)
        return
      }
      workout = data as Workout
      setWorkouts([workout, ...workouts])
    }
    const { data, error } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workout.id,
        exercise_id: exercise.id,
        exercise_order: workoutExercises.filter((item) => item.workout_id === workout.id).length,
      })
      .select()
      .single()
    if (error) {
      setStatus(error.message)
      return
    }
    setWorkoutExercises([...workoutExercises, data as WorkoutExercise])
    await addSet((data as WorkoutExercise).id)
  }

  async function addSet(workoutExerciseId: string) {
    const setOrder = sets.filter((set) => set.workout_exercise_id === workoutExerciseId).length
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({ workout_exercise_id: workoutExerciseId, set_order: setOrder })
      .select()
      .single()
    if (error) {
      setStatus(error.message)
      return
    }
    setSets([...sets, data as WorkoutSet])
  }

  async function updateSet(set: WorkoutSet, patch: Partial<WorkoutSet>) {
    const next = { ...set, ...patch }
    setSets(sets.map((candidate) => (candidate.id === set.id ? next : candidate)))
    const { error } = await supabase.from('workout_sets').update(patch).eq('id', set.id)
    if (error) setStatus(error.message)
  }

  async function deleteSet(set: WorkoutSet) {
    setSets(sets.filter((candidate) => candidate.id !== set.id))
    const { error } = await supabase.from('workout_sets').delete().eq('id', set.id)
    if (error) setStatus(error.message)
  }

  async function addToRoutine(exercise: Exercise) {
    if (!session) return
    let routine = routines[0]
    if (!routine) {
      const { data, error } = await supabase
        .from('routines')
        .insert({ user_id: session.user.id, name: 'Default routine' })
        .select()
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

  const selectedExerciseSets = selectedExercise
    ? sets.filter((set) => {
        const item = workoutExercises.find((candidate) => candidate.id === set.workout_exercise_id)
        return item?.exercise_id === selectedExercise.id
      })
    : []

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl gap-4 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-[1.1fr_0.9fr]">
      <header className="md:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">strengthOS</h1>
            <p className="text-sm text-gray-400">Supabase-backed workout tracking with a Turso MCP path.</p>
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
          workoutExercises={workoutExercises.filter((item) => item.workout_id === activeWorkout?.id)}
          sets={sets}
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
