import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ActiveWorkoutPage } from './components/ActiveWorkoutPage'
import { AnalyticsRoutePage } from './components/AnalyticsRoutePage'
import { AuthView } from './components/AuthView'
import { ExerciseDetails } from './components/ExerciseDetails'
import { ExercisePicker } from './components/ExercisePicker'
import { ExercisesPage } from './components/ExercisesPage'
import { HomePage } from './components/HomePage'
import { ProfilePage } from './components/ProfilePage'
import { RoutineEditorPage } from './components/RoutineEditorPage'
import { RoutineActionList } from './components/RoutineUI'
import { WorkoutPage } from './components/WorkoutPage'
import {
  AppShell,
  BottomSheet,
  ConfirmDialog,
  DismissibleBanner,
  PrimaryButton,
  SecondaryButton,
} from './components/ui'
import { bestCompletedSet } from './lib/performance'
import { supabase } from './lib/supabase'
import { formatRoutineTarget, parseRoutineTarget } from './lib/training'
import type { Exercise, Routine, RoutineExercise, Workout, WorkoutExercise, WorkoutSet } from './lib/types'

const EXERCISE_COLUMNS =
  'id, external_id, source, user_id, name, normalized_name, primary_muscle, secondary_muscles, body_part, equipment, movement_category, instructions, image_url, animation_url, thumbnail_url, is_custom, is_active'
const WORKOUT_COLUMNS = 'id, user_id, name, started_at, completed_at, notes'
const WORKOUT_EXERCISE_COLUMNS = 'id, workout_id, exercise_id, exercise_order'
const WORKOUT_SET_COLUMNS = 'id, workout_exercise_id, set_order, reps, weight, is_completed, notes, completed_at'
const ROUTINE_COLUMNS = 'id, user_id, name, notes, created_at, updated_at'
const ROUTINE_EXERCISE_COLUMNS = 'id, routine_id, exercise_id, exercise_order, target_sets, target_reps, notes, created_at'
const REORDER_HINT_KEY = 'strengthos:routine-reorder-hint:dismissed'

type Route =
  | { name: 'home'; pathname: '/' }
  | { name: 'workout'; pathname: '/workout' }
  | { name: 'active-workout'; pathname: '/workout/active' }
  | { name: 'analytics'; pathname: '/analytics' }
  | { name: 'exercises'; pathname: '/exercises' }
  | { name: 'profile'; pathname: '/profile' }
  | { name: 'routine-new'; pathname: '/routines/new' }
  | { name: 'routine-edit'; pathname: string; routineId: string }

type StatusTone = 'warning' | 'danger' | 'success'

type StatusMessage = {
  tone: StatusTone
  message: string
}

type PickerMode = 'workout' | 'routine'
type ExerciseDetailSource = 'workout' | 'routine' | 'library' | 'active-workout'

type DraftRoutineExercise = RoutineExercise & {
  exercise: Exercise | null
  minReps: string
  maxReps: string
  targetRpe: string
}

type RoutineDraft = {
  sourceKey: string
  routineId: string | null
  title: string
  name: string
  notes: string
  exercises: DraftRoutineExercise[]
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [showReorderHint, setShowReorderHint] = useState(() => localStorage.getItem(REORDER_HINT_KEY) !== '1')
  const [routineGroupExpanded, setRoutineGroupExpanded] = useState(true)
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [selectedExerciseSource, setSelectedExerciseSource] = useState<ExerciseDetailSource>('library')
  const [selectedExerciseSets, setSelectedExerciseSets] = useState<WorkoutSet[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)
  const [routineToDelete, setRoutineToDelete] = useState<Routine | null>(null)
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft | null>(null)
  const [routineValidationError, setRoutineValidationError] = useState('')
  const [isSavingRoutine, setIsSavingRoutine] = useState(false)
  const [pendingRoutineExercises, setPendingRoutineExercises] = useState<Exercise[]>([])

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineExercises, setRoutineExercises] = useState<RoutineExercise[]>([])
  const [routineOrder, setRoutineOrder] = useState<string[]>([])
  const exerciseHistoryRequestRef = useRef(0)

  const route = useMemo(() => parseRoute(pathname), [pathname])
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])
  const routineById = useMemo(() => new Map(routines.map((routine) => [routine.id, routine])), [routines])
  const workoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout])), [workouts])
  const activeWorkout = useMemo(() => workouts.find((workout) => !workout.completed_at) ?? null, [workouts])

  const workoutExercisesByWorkoutId = useMemo(() => groupBy(workoutExercises, (item) => item.workout_id), [workoutExercises])
  const setsByWorkoutExerciseId = useMemo(() => groupBy(sets, (set) => set.workout_exercise_id), [sets])
  const routineExercisesByRoutineId = useMemo(
    () => groupBy(routineExercises, (item) => item.routine_id, (left, right) => left.exercise_order - right.exercise_order),
    [routineExercises],
  )

  const activeWorkoutExercises = useMemo(
    () => (activeWorkout ? workoutExercisesByWorkoutId.get(activeWorkout.id) ?? [] : []),
    [activeWorkout, workoutExercisesByWorkoutId],
  )
  const activeWorkoutSets = useMemo(
    () => activeWorkoutExercises.flatMap((item) => setsByWorkoutExerciseId.get(item.id) ?? []),
    [activeWorkoutExercises, setsByWorkoutExerciseId],
  )

  const orderedRoutines = useMemo(
    () => applyRoutineOrder(routines, routineOrder),
    [routineOrder, routines],
  )

  const previousSetsByExerciseId = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>()
    const completedWorkoutExercises = [...workoutExercises].sort((left, right) => {
      const leftWorkout = workoutById.get(left.workout_id)
      const rightWorkout = workoutById.get(right.workout_id)
      return new Date(rightWorkout?.completed_at ?? rightWorkout?.started_at ?? 0).getTime() - new Date(leftWorkout?.completed_at ?? leftWorkout?.started_at ?? 0).getTime()
    })

    for (const item of completedWorkoutExercises) {
      const workout = workoutById.get(item.workout_id)
      if (!workout?.completed_at || map.has(item.exercise_id)) continue
      const itemSets = (setsByWorkoutExerciseId.get(item.id) ?? []).filter((set) => set.is_completed || set.weight !== null || set.reps !== null)
      if (itemSets.length) {
        map.set(item.exercise_id, itemSets)
      }
    }

    return map
  }, [setsByWorkoutExerciseId, workoutById, workoutExercises])

  const historicalRecordsByExerciseId = useMemo(() => {
    const map = new Map<string, { maxWeight: number; volume: number }>()

    for (const item of workoutExercises) {
      const workout = workoutById.get(item.workout_id)
      if (!workout?.completed_at) continue

      const completedSets = (setsByWorkoutExerciseId.get(item.id) ?? []).filter((set) => set.is_completed && set.weight && set.reps)
      if (!completedSets.length) continue

      const current = map.get(item.exercise_id) ?? { maxWeight: 0, volume: 0 }
      const maxWeight = Math.max(...completedSets.map((set) => set.weight ?? 0))
      const volume = completedSets.reduce((total, set) => total + (set.weight ?? 0) * (set.reps ?? 0), 0)
      map.set(item.exercise_id, {
        maxWeight: Math.max(current.maxWeight, maxWeight),
        volume: Math.max(current.volume, volume),
      })
    }

    return map
  }, [setsByWorkoutExerciseId, workoutById, workoutExercises])

  const completedWorkouts = useMemo(() => workouts.filter((workout) => workout.completed_at), [workouts])
  const weeklyCompletedWorkouts = useMemo(
    () => completedWorkouts.filter((workout) => Date.now() - new Date(workout.completed_at ?? workout.started_at).getTime() <= 7 * 24 * 60 * 60 * 1000),
    [completedWorkouts],
  )
  const personalRecord = useMemo(() => bestCompletedSet(sets) ?? null, [sets])

  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    setRoutineOrder(loadRoutineOrder(session.user.id))
    void loadData(true)
  }, [session])

  useEffect(() => {
    if (!selectedExercise) {
      exerciseHistoryRequestRef.current += 1
      setSelectedExerciseSets([])
      return
    }
    void loadExerciseHistory(selectedExercise.id)
  }, [selectedExercise])

  useEffect(() => {
    if (route.name !== 'routine-new' && route.name !== 'routine-edit') {
      setRoutineValidationError('')
      return
    }

    const sourceKey = route.name === 'routine-new' ? 'new' : route.routineId
    if (routineDraft?.sourceKey === sourceKey) return

    if (route.name === 'routine-new') {
      setRoutineDraft(buildRoutineDraft({ sourceKey, exercises: pendingRoutineExercises, exerciseById }))
      setPendingRoutineExercises([])
      return
    }

    const routine = routineById.get(route.routineId)
    const items = routineExercisesByRoutineId.get(route.routineId) ?? []
    if (!routine) return

    setRoutineDraft(
      buildRoutineDraft({
        sourceKey,
        routine,
        routineExercises: items,
        exerciseById,
      }),
    )
  }, [exerciseById, pendingRoutineExercises, route, routineById, routineDraft?.sourceKey, routineExercisesByRoutineId])

  async function loadData(showLoading: boolean) {
    if (!session) return
    if (showLoading) setIsInitialLoading(true)
    setLoadError(null)

    const [
      { data: exerciseRows, error: exerciseError },
      { data: workoutRows, error: workoutError },
      { data: routineRows, error: routineError },
    ] = await Promise.all([
      supabase.from('exercises').select(EXERCISE_COLUMNS).eq('is_active', true).order('name'),
      supabase.from('workouts').select(WORKOUT_COLUMNS).order('started_at', { ascending: false }),
      supabase.from('routines').select(ROUTINE_COLUMNS).order('created_at', { ascending: false }),
    ])

    const loadFailure = exerciseError ?? workoutError ?? routineError
    if (loadFailure) {
      setLoadError(loadFailure.message)
      setIsInitialLoading(false)
      return
    }

    const loadedExercises = (exerciseRows ?? []) as Exercise[]
    const loadedWorkouts = (workoutRows ?? []) as Workout[]
    const loadedRoutines = (routineRows ?? []) as Routine[]

    setExercises(loadedExercises)
    setWorkouts(loadedWorkouts)
    setRoutines(loadedRoutines)

    const [workoutChildrenLoaded, routineChildrenLoaded] = await Promise.all([
      loadWorkoutChildren(loadedWorkouts),
      loadRoutineChildren(loadedRoutines),
    ])

    if (workoutChildrenLoaded && routineChildrenLoaded) {
      setRoutineOrder((current) => mergeRoutineOrder(current, loadedRoutines.map((routine) => routine.id)))
    }

    setIsInitialLoading(false)
  }

  async function loadWorkoutChildren(loadedWorkouts: Workout[]): Promise<boolean> {
    const workoutIds = loadedWorkouts.map((workout) => workout.id)
    if (!workoutIds.length) {
      setWorkoutExercises([])
      setSets([])
      return true
    }

    const { data: exerciseRows, error: workoutExerciseError } = await supabase
      .from('workout_exercises')
      .select(WORKOUT_EXERCISE_COLUMNS)
      .in('workout_id', workoutIds)
      .order('exercise_order')

    if (workoutExerciseError) {
      setLoadError(workoutExerciseError.message)
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
      setLoadError(setError.message)
      return false
    }

    setSets((setRows ?? []) as WorkoutSet[])
    return true
  }

  async function loadRoutineChildren(loadedRoutines: Routine[]): Promise<boolean> {
    const routineIds = loadedRoutines.map((routine) => routine.id)
    if (!routineIds.length) {
      setRoutineExercises([])
      return true
    }

    const { data, error } = await supabase
      .from('routine_exercises')
      .select(ROUTINE_EXERCISE_COLUMNS)
      .in('routine_id', routineIds)
      .order('exercise_order')

    if (error) {
      setLoadError(error.message)
      return false
    }

    setRoutineExercises((data ?? []) as RoutineExercise[])
    return true
  }

  async function loadExerciseHistory(exerciseId: string) {
    const requestId = ++exerciseHistoryRequestRef.current
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_exercises')
      .select(WORKOUT_EXERCISE_COLUMNS)
      .eq('exercise_id', exerciseId)

    if (requestId !== exerciseHistoryRequestRef.current) return

    if (exerciseError) {
      setStatus({ tone: 'danger', message: exerciseError.message })
      return
    }

    const workoutExerciseIds = ((exerciseRows ?? []) as WorkoutExercise[]).map((item) => item.id)
    if (!workoutExerciseIds.length) {
      if (requestId !== exerciseHistoryRequestRef.current) return
      setSelectedExerciseSets([])
      return
    }

    const { data: setRows, error: setError } = await supabase
      .from('workout_sets')
      .select(WORKOUT_SET_COLUMNS)
      .in('workout_exercise_id', workoutExerciseIds)
      .order('completed_at', { ascending: false })

    if (requestId !== exerciseHistoryRequestRef.current) return

    if (setError) {
      setStatus({ tone: 'danger', message: setError.message })
      return
    }

    setSelectedExerciseSets((setRows ?? []) as WorkoutSet[])
  }

  function navigate(nextPath: string) {
    if (nextPath === pathname) return
    window.history.pushState({}, '', nextPath)
    setPathname(nextPath)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  async function createWorkout(name = 'Workout'): Promise<Workout | null> {
    if (!session) return null

    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: session.user.id, name })
      .select(WORKOUT_COLUMNS)
      .single()

    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return null
    }

    const workout = data as Workout
    setWorkouts((current) => [workout, ...current])
    return workout
  }

  async function startEmptyWorkout() {
    const workout = activeWorkout ?? (await createWorkout('Workout'))
    if (!workout) return
    navigate('/workout/active')
  }

  async function addExerciseToWorkout(exercise: Exercise, navigateAfter = false) {
    const workout = activeWorkout ?? (await createWorkout('Workout'))
    if (!workout) return false

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
      setStatus({ tone: 'danger', message: error.message })
      return false
    }

    const workoutExercise = data as WorkoutExercise
    setWorkoutExercises((current) => [...current, workoutExercise])
    await addSet(workoutExercise.id, exercise.id)
    setStatus({ tone: 'success', message: `${exercise.name} added to workout.` })

    if (navigateAfter) navigate('/workout/active')
    return true
  }

  async function startRoutineWorkout(routine: Routine) {
    const templateExercises = routineExercisesByRoutineId.get(routine.id) ?? []
    if (!templateExercises.length) {
      setStatus({ tone: 'warning', message: 'Add exercises to the routine before starting it.' })
      return
    }

    if (activeWorkout && activeWorkoutExercises.length) {
      setStatus({ tone: 'warning', message: 'An active workout is already in progress.' })
      navigate('/workout/active')
      return
    }

    const workout = activeWorkout ?? (await createWorkout(routine.name))
    if (!workout) return

    const baseOrder = workoutExercisesByWorkoutId.get(workout.id)?.length ?? 0
    const insertPayload = templateExercises.map((item, index) => ({
      workout_id: workout.id,
      exercise_id: item.exercise_id,
      exercise_order: baseOrder + index,
    }))

    const { data, error } = await supabase.from('workout_exercises').insert(insertPayload).select(WORKOUT_EXERCISE_COLUMNS)
    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    const insertedWorkoutExercises = ((data ?? []) as WorkoutExercise[]).sort((left, right) => left.exercise_order - right.exercise_order)
    setWorkoutExercises((current) => [...current, ...insertedWorkoutExercises])

    const setPayload = insertedWorkoutExercises.flatMap((item, index) => {
      const template = templateExercises[index]
      const targetSets = Math.max(template?.target_sets ?? 1, 1)
      return Array.from({ length: targetSets }, (_, setIndex) => ({
        workout_exercise_id: item.id,
        set_order: setIndex,
      }))
    })

    if (setPayload.length) {
      const { data: insertedSets, error: setError } = await supabase.from('workout_sets').insert(setPayload).select(WORKOUT_SET_COLUMNS)
      if (setError) {
        setStatus({ tone: 'danger', message: setError.message })
        return
      }
      setSets((current) => [...current, ...((insertedSets ?? []) as WorkoutSet[])])
    }

    setStatus({ tone: 'success', message: `${routine.name} started.` })
    navigate('/workout/active')
  }

  async function addSet(workoutExerciseId: string, exerciseId?: string) {
    const setOrder = setsByWorkoutExerciseId.get(workoutExerciseId)?.length ?? 0
    const { data, error } = await supabase
      .from('workout_sets')
      .insert({ workout_exercise_id: workoutExerciseId, set_order: setOrder })
      .select(WORKOUT_SET_COLUMNS)
      .single()

    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    const newSet = data as WorkoutSet
    setSets((current) => [...current, newSet])
    if (exerciseId && exerciseId === selectedExercise?.id) {
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
      setStatus({ tone: 'danger', message: error.message })
    }
  }

  async function deleteSet(set: WorkoutSet) {
    setSets((current) => current.filter((candidate) => candidate.id !== set.id))
    setSelectedExerciseSets((current) => current.filter((candidate) => candidate.id !== set.id))

    const { error } = await supabase.from('workout_sets').delete().eq('id', set.id)
    if (error) {
      setSets((current) => [...current, set].sort((left, right) => left.set_order - right.set_order))
      setSelectedExerciseSets((current) => [...current, set].sort((left, right) => left.set_order - right.set_order))
      setStatus({ tone: 'danger', message: error.message })
    }
  }

  async function updateWorkout(workout: Workout, patch: Partial<Workout>) {
    const previous = workout
    const next = { ...workout, ...patch }
    setWorkouts((current) => current.map((candidate) => (candidate.id === workout.id ? next : candidate)))

    const { error } = await supabase.from('workouts').update(patch).eq('id', workout.id)
    if (error) {
      setWorkouts((current) => current.map((candidate) => (candidate.id === workout.id ? previous : candidate)))
      setStatus({ tone: 'danger', message: error.message })
    }
  }

  async function finishWorkout() {
    if (!activeWorkout) return
    const completedAt = new Date().toISOString()
    const previous = activeWorkout
    setWorkouts((current) => current.map((candidate) => (candidate.id === activeWorkout.id ? { ...candidate, completed_at: completedAt } : candidate)))

    const { error } = await supabase.from('workouts').update({ completed_at: completedAt }).eq('id', activeWorkout.id)
    if (error) {
      setWorkouts((current) => current.map((candidate) => (candidate.id === previous.id ? previous : candidate)))
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    setStatus({ tone: 'success', message: 'Workout finished.' })
    navigate('/workout')
  }

  async function discardWorkout() {
    if (!activeWorkout) return

    const workoutId = activeWorkout.id
    const removedWorkoutExercises = workoutExercises.filter((item) => item.workout_id === workoutId)
    const removedWorkoutExerciseIds = new Set(removedWorkoutExercises.map((item) => item.id))
    const previousWorkout = activeWorkout
    const previousSets = sets

    setWorkouts((current) => current.filter((workout) => workout.id !== workoutId))
    setWorkoutExercises((current) => current.filter((item) => item.workout_id !== workoutId))
    setSets((current) => current.filter((set) => !removedWorkoutExerciseIds.has(set.workout_exercise_id)))

    const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
    if (error) {
      setWorkouts((current) => [previousWorkout, ...current])
      setWorkoutExercises((current) => [...current, ...removedWorkoutExercises])
      setSets(previousSets)
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    setStatus({ tone: 'success', message: 'Workout discarded.' })
    navigate('/workout')
  }

  async function duplicateRoutine(routine: Routine) {
    const sourceExercises = routineExercisesByRoutineId.get(routine.id) ?? []
    const { data, error } = await supabase
      .from('routines')
      .insert({
        user_id: routine.user_id,
        name: `${routine.name} Copy`,
        notes: routine.notes,
      })
      .select(ROUTINE_COLUMNS)
      .single()

    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    const duplicatedRoutine = data as Routine
    if (sourceExercises.length) {
      const copyPayload = sourceExercises.map((item, index) => ({
        routine_id: duplicatedRoutine.id,
        exercise_id: item.exercise_id,
        exercise_order: index,
        target_sets: item.target_sets,
        target_reps: item.target_reps,
        notes: item.notes,
      }))
      const { error: copyError } = await supabase.from('routine_exercises').insert(copyPayload)
      if (copyError) {
        await supabase.from('routines').delete().eq('id', duplicatedRoutine.id)
        setStatus({ tone: 'danger', message: copyError.message })
        return
      }
    }

    setStatus({ tone: 'success', message: `${routine.name} duplicated.` })
    await loadData(false)
    setRoutineOrder((current) => {
      const next = insertAfter(current, routine.id, duplicatedRoutine.id)
      persistRoutineOrder(session?.user.id, next)
      return next
    })
    setSelectedRoutineId(null)
  }

  async function deleteRoutine() {
    if (!routineToDelete) return
    const target = routineToDelete
    const { error } = await supabase.from('routines').delete().eq('id', target.id)
    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return
    }

    setRoutines((current) => current.filter((routine) => routine.id !== target.id))
    setRoutineExercises((current) => current.filter((item) => item.routine_id !== target.id))
    setRoutineOrder((current) => {
      const next = current.filter((id) => id !== target.id)
      persistRoutineOrder(session?.user.id, next)
      return next
    })
    setRoutineToDelete(null)
    setSelectedRoutineId(null)
    setStatus({ tone: 'success', message: `${target.name} deleted.` })
  }

  function moveRoutine(routineId: string, direction: -1 | 1) {
    setRoutineOrder((current) => {
      const ids = mergeRoutineOrder(current, routines.map((routine) => routine.id))
      const index = ids.indexOf(routineId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return ids

      const next = [...ids]
      const [target] = next.splice(index, 1)
      next.splice(nextIndex, 0, target)
      persistRoutineOrder(session?.user.id, next)
      return next
    })
    setStatus({ tone: 'warning', message: 'Routine order saved locally on this device. Backend has no persistent routine order field yet.' })
  }

  function dismissReorderHint() {
    localStorage.setItem(REORDER_HINT_KEY, '1')
    setShowReorderHint(false)
  }

  function openExerciseDetails(exercise: Exercise, source: ExerciseDetailSource = 'library') {
    setSelectedExercise(exercise)
    setSelectedExerciseSource(source)
  }

  function openRoutinePicker() {
    setPickerMode('routine')
  }

  function openWorkoutPicker() {
    setPickerMode('workout')
  }

  async function handleExerciseSelected(exercise: Exercise) {
    if (pickerMode === 'routine') {
      addExerciseToRoutineDraft(exercise)
      setPickerMode(null)
      return
    }

    const added = await addExerciseToWorkout(exercise, true)
    if (added) setPickerMode(null)
  }

  function addExerciseToRoutineDraft(exercise: Exercise) {
    setRoutineDraft((current) => {
      if (!current) return current
      const item = buildDraftRoutineExercise({
        id: `draft-${exercise.id}-${crypto.randomUUID()}`,
        routine_id: current.routineId ?? 'draft',
        exercise_id: exercise.id,
        exercise_order: current.exercises.length,
        target_sets: null,
        target_reps: null,
        notes: null,
        created_at: new Date().toISOString(),
      }, exercise)

      return {
        ...current,
        exercises: [...current.exercises, item],
      }
    })
    setStatus({ tone: 'success', message: `${exercise.name} added to routine draft.` })
  }

  async function saveRoutine() {
    if (!session || !routineDraft) return

    const name = routineDraft.name.trim()
    if (!name) {
      setRoutineValidationError('Routine name is required.')
      return
    }
    if (!routineDraft.exercises.length) {
      setRoutineValidationError('Add at least one exercise.')
      return
    }

    setRoutineValidationError('')
    setIsSavingRoutine(true)

    let routineId = routineDraft.routineId
    let createdRoutine: Routine | null = null

    if (!routineId) {
      const { data, error } = await supabase
        .from('routines')
        .insert({
          user_id: session.user.id,
          name,
          notes: routineDraft.notes.trim() || null,
        })
        .select(ROUTINE_COLUMNS)
        .single()

      if (error) {
        setStatus({ tone: 'danger', message: error.message })
        setIsSavingRoutine(false)
        return
      }

      createdRoutine = data as Routine
      routineId = createdRoutine.id
    }

    const previousExerciseIds = routineId ? (routineExercisesByRoutineId.get(routineId) ?? []).map((item) => item.id) : []
    const exercisePayload = routineDraft.exercises.map((item, index) => ({
      routine_id: routineId,
      exercise_id: item.exercise_id,
      exercise_order: index,
      target_sets: item.target_sets,
      target_reps: formatRoutineTarget({
        minReps: item.minReps,
        maxReps: item.maxReps,
        rpe: item.targetRpe,
      }),
      notes: item.notes,
    }))

    const { data: insertedExercises, error: insertError } = await supabase
      .from('routine_exercises')
      .insert(exercisePayload)
      .select(ROUTINE_EXERCISE_COLUMNS)
    if (insertError) {
      if (createdRoutine) await supabase.from('routines').delete().eq('id', createdRoutine.id)
      setStatus({ tone: 'danger', message: insertError.message })
      setIsSavingRoutine(false)
      return
    }

    const insertedExerciseIds = ((insertedExercises ?? []) as RoutineExercise[]).map((item) => item.id)
    if (previousExerciseIds.length) {
      const { error: deleteError } = await supabase.from('routine_exercises').delete().in('id', previousExerciseIds)
      if (deleteError) {
        if (insertedExerciseIds.length) await supabase.from('routine_exercises').delete().in('id', insertedExerciseIds)
        setStatus({ tone: 'danger', message: deleteError.message })
        setIsSavingRoutine(false)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('routines')
      .update({ name, notes: routineDraft.notes.trim() || null })
      .eq('id', routineId)
    if (updateError) {
      setStatus({ tone: 'danger', message: updateError.message })
      setIsSavingRoutine(false)
      return
    }

    await loadData(false)
    if (createdRoutine) {
      setRoutineOrder((current) => {
        const next = [createdRoutine!.id, ...current.filter((id) => id !== createdRoutine!.id)]
        persistRoutineOrder(session.user.id, next)
        return next
      })
    }
    setIsSavingRoutine(false)
    setStatus({ tone: 'success', message: createdRoutine ? 'Routine created.' : 'Routine updated.' })
    navigate('/workout')
  }

  function updateRoutineExerciseField(
    exerciseId: string,
    patch: Partial<Pick<DraftRoutineExercise, 'target_sets' | 'minReps' | 'maxReps' | 'targetRpe'>>,
  ) {
    setRoutineDraft((current) => {
      if (!current) return current
      return {
        ...current,
        exercises: current.exercises.map((item) => (item.id === exerciseId ? { ...item, ...patch } : item)),
      }
    })
  }

  function moveRoutineExercise(exerciseId: string, direction: -1 | 1) {
    setRoutineDraft((current) => {
      if (!current) return current
      const index = current.exercises.findIndex((item) => item.id === exerciseId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.exercises.length) return current

      const nextExercises = [...current.exercises]
      const [target] = nextExercises.splice(index, 1)
      nextExercises.splice(nextIndex, 0, target)
      return {
        ...current,
        exercises: nextExercises.map((item, itemIndex) => ({ ...item, exercise_order: itemIndex })),
      }
    })
  }

  function removeRoutineExercise(exerciseId: string) {
    setRoutineDraft((current) => {
      if (!current) return current
      return {
        ...current,
        exercises: current.exercises
          .filter((item) => item.id !== exerciseId)
          .map((item, index) => ({ ...item, exercise_order: index })),
      }
    })
  }

  function openRoutineForEdit(routineId: string) {
    setSelectedRoutineId(null)
    navigate(`/routines/${routineId}/edit`)
  }

  function routineSummary(routineId: string) {
    const items = routineExercisesByRoutineId.get(routineId) ?? []
    if (!items.length) return 'No exercises yet.'
    return items
      .map((item) => {
        const exercise = exerciseById.get(item.exercise_id)
        return exercise ? `${exercise.name}${exercise.equipment ? ` (${exercise.equipment})` : ''}` : 'Unknown exercise'
      })
      .join(', ')
  }

  const routineActionTarget = selectedRoutineId ? orderedRoutines.find((routine) => routine.id === selectedRoutineId) ?? null : null

  if (!session) return <AuthView />

  return (
    <AppShell currentPath={route.pathname} onNavigate={navigate}>
      {renderPage()}

      <BottomSheet
        open={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode === 'routine' ? 'Add Exercise to Routine' : 'Add Exercise'}
      >
        <ExercisePicker
          exercises={exercises}
          isLoading={isInitialLoading}
          actionLabel="Add"
          onSelect={handleExerciseSelected}
          onOpenDetails={(exercise) => openExerciseDetails(exercise, pickerMode === 'routine' ? 'routine' : 'workout')}
        />
      </BottomSheet>

      <BottomSheet
        open={Boolean(routineActionTarget)}
        onClose={() => setSelectedRoutineId(null)}
        title={routineActionTarget?.name ?? 'Routine actions'}
      >
        {routineActionTarget ? (
          <RoutineActionList
            canMoveUp={orderedRoutines.findIndex((routine) => routine.id === routineActionTarget.id) > 0}
            canMoveDown={orderedRoutines.findIndex((routine) => routine.id === routineActionTarget.id) < orderedRoutines.length - 1}
            onEdit={() => openRoutineForEdit(routineActionTarget.id)}
            onDuplicate={() => void duplicateRoutine(routineActionTarget)}
            onMoveUp={() => moveRoutine(routineActionTarget.id, -1)}
            onMoveDown={() => moveRoutine(routineActionTarget.id, 1)}
            onDelete={() => setRoutineToDelete(routineActionTarget)}
          />
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(routineToDelete)}
        onClose={() => setRoutineToDelete(null)}
        title="Delete routine?"
        description={`This will remove ${routineToDelete?.name ?? 'this routine'} and its exercises.`}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <SecondaryButton onClick={() => setRoutineToDelete(null)}>Cancel</SecondaryButton>
            <PrimaryButton className="bg-accent-danger active:bg-red-600" onClick={() => void deleteRoutine()}>
              Delete
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">This action cannot be undone.</p>
      </ConfirmDialog>

      {selectedExercise ? (
        <ExerciseDetails
          exercise={selectedExercise}
          sets={selectedExerciseSets}
          open={Boolean(selectedExercise)}
          onClose={() => setSelectedExercise(null)}
          action={renderExerciseDetailsAction(selectedExercise)}
        />
      ) : null}
    </AppShell>
  )

  function addToRoutineFlow(exercise: Exercise) {
    if (pickerMode === 'routine' || route.name === 'routine-new' || route.name === 'routine-edit') {
      addExerciseToRoutineDraft(exercise)
      return
    }

    setPendingRoutineExercises([exercise])
    setRoutineDraft(null)
    navigate('/routines/new')
  }

  function renderExerciseDetailsAction(exercise: Exercise) {
    if (selectedExerciseSource === 'active-workout') return null
    if (selectedExerciseSource === 'routine' || route.name === 'routine-new' || route.name === 'routine-edit') {
      return (
        <PrimaryButton
          onClick={() => {
            addToRoutineFlow(exercise)
            setSelectedExercise(null)
          }}
        >
          Add to Routine
        </PrimaryButton>
      )
    }

    return <PrimaryButton onClick={() => void addExerciseToWorkout(exercise, true)}>Add to Workout</PrimaryButton>
  }

  function renderPage() {
    switch (route.name) {
      case 'home':
        return (
          <HomePage
            banners={renderBanners()}
            weeklyCompletedWorkouts={weeklyCompletedWorkouts}
            completedWorkouts={completedWorkouts}
            routines={routines}
            exerciseCount={exercises.length}
            personalRecord={personalRecord}
            onOpenProfile={() => navigate('/profile')}
          />
        )

      case 'workout':
        return (
          <WorkoutPage
            banners={renderBanners()}
            routines={orderedRoutines}
            routineGroupExpanded={routineGroupExpanded}
            showReorderHint={showReorderHint}
            isLoading={isInitialLoading}
            loadError={loadError}
            routineSummary={routineSummary}
            onToggleRoutineGroup={() => setRoutineGroupExpanded((current) => !current)}
            onDismissReorderHint={dismissReorderHint}
            onRetry={() => void loadData(true)}
            onNavigate={navigate}
            onStartEmptyWorkout={() => void startEmptyWorkout()}
            onOpenRoutine={openRoutineForEdit}
            onOpenRoutineMenu={setSelectedRoutineId}
            onStartRoutine={(routine) => void startRoutineWorkout(routine)}
          />
        )

      case 'active-workout':
        return (
          <ActiveWorkoutPage
            banners={renderBanners()}
            workout={activeWorkout}
            workoutExercises={activeWorkoutExercises}
            sets={activeWorkoutSets}
            exerciseById={exerciseById}
            previousSetsByExerciseId={previousSetsByExerciseId}
            historicalRecordsByExerciseId={historicalRecordsByExerciseId}
            onCreateWorkout={() => void startEmptyWorkout()}
            onOpenExercisePicker={openWorkoutPicker}
            onOpenExerciseDetails={(exercise) => openExerciseDetails(exercise, 'active-workout')}
            onAddSet={(workoutExerciseId) => void addSet(workoutExerciseId)}
            onUpdateSet={(set, patch) => void updateSet(set, patch)}
            onDeleteSet={(set) => void deleteSet(set)}
            onFinishWorkout={() => void finishWorkout()}
            onDiscardWorkout={() => void discardWorkout()}
            onUpdateWorkout={(workout, patch) => void updateWorkout(workout, patch)}
          />
        )

      case 'analytics':
        return (
          <AnalyticsRoutePage
            banners={renderBanners()}
            exercises={exercises}
            workouts={workouts}
            workoutExercises={workoutExercises}
            sets={sets}
            isLoading={isInitialLoading}
            loadError={loadError}
            onRetry={() => void loadData(true)}
          />
        )

      case 'routine-new':
      case 'routine-edit':
        return (
          <RoutineEditorPage
            mode={route.name === 'routine-new' ? 'new' : 'edit'}
            banners={renderBanners()}
            draft={routineDraft}
            validationError={routineValidationError}
            isSaving={isSavingRoutine}
            onBack={() => navigate('/workout')}
            onNameChange={(value) => setRoutineDraft((current) => (current ? { ...current, name: value } : current))}
            onNotesChange={(value) => setRoutineDraft((current) => (current ? { ...current, notes: value } : current))}
            onAddExercise={openRoutinePicker}
            onSave={() => void saveRoutine()}
            onCancel={() => navigate('/workout')}
            onRemoveExercise={removeRoutineExercise}
            onMoveExercise={moveRoutineExercise}
            onExerciseFieldChange={updateRoutineExerciseField}
          />
        )

      case 'exercises':
        return (
          <ExercisesPage
            banners={renderBanners()}
            exercises={exercises}
            isLoading={isInitialLoading}
            loadError={loadError}
            onBack={() => navigate('/workout')}
            onRetry={() => void loadData(true)}
            onSelect={(exercise) => void addExerciseToWorkout(exercise, true)}
            onOpenDetails={(exercise) => openExerciseDetails(exercise, 'library')}
          />
        )

      case 'profile':
        return (
          <ProfilePage
            session={session}
            banners={renderBanners()}
            onNavigate={navigate}
            onStatus={setStatus}
          />
        )
    }
  }

  function renderBanners() {
    return (
      <div className="space-y-3">
        {!isOnline ? (
          <DismissibleBanner tone="warning">
            You are offline. Existing workout data stays visible, but edits will fail until the connection returns.
          </DismissibleBanner>
        ) : null}
        {status ? (
          <DismissibleBanner tone={status.tone} onDismiss={() => setStatus(null)}>
            {status.message}
          </DismissibleBanner>
        ) : null}
      </div>
    )
  }
}

function parseRoute(pathname: string): Route {
  if (pathname === '/workout') return { name: 'workout', pathname }
  if (pathname === '/workout/active') return { name: 'active-workout', pathname }
  if (pathname === '/analytics') return { name: 'analytics', pathname }
  if (pathname === '/exercises') return { name: 'exercises', pathname }
  if (pathname === '/profile') return { name: 'profile', pathname }
  if (pathname === '/routines/new') return { name: 'routine-new', pathname }

  const routineMatch = pathname.match(/^\/routines\/([^/]+)\/edit$/)
  if (routineMatch) return { name: 'routine-edit', pathname, routineId: routineMatch[1] }

  return { name: 'home', pathname: '/' }
}

function groupBy<T>(items: T[], getKey: (item: T) => string, sort?: (left: T, right: T) => number) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const group = map.get(key) ?? []
    group.push(item)
    map.set(key, sort ? group.sort(sort) : group)
  }
  return map
}

function applyRoutineOrder(routines: Routine[], routineOrder: string[]) {
  const orderMap = new Map(routineOrder.map((id, index) => [id, index]))
  return [...routines].sort((left, right) => {
    const leftIndex = orderMap.get(left.id)
    const rightIndex = orderMap.get(right.id)
    if (leftIndex === undefined && rightIndex === undefined) {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    }
    if (leftIndex === undefined) return 1
    if (rightIndex === undefined) return -1
    return leftIndex - rightIndex
  })
}

function loadRoutineOrder(userId: string) {
  try {
    const raw = localStorage.getItem(routineOrderKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function persistRoutineOrder(userId: string | undefined, routineIds: string[]) {
  if (!userId) return
  localStorage.setItem(routineOrderKey(userId), JSON.stringify(routineIds))
}

function routineOrderKey(userId: string) {
  return `strengthos:routine-order:${userId}`
}

function mergeRoutineOrder(current: string[], routineIds: string[]) {
  const retained = current.filter((id) => routineIds.includes(id))
  const additions = routineIds.filter((id) => !retained.includes(id))
  return [...retained, ...additions]
}

function insertAfter(current: string[], existingId: string, nextId: string) {
  const normalized = current.filter((id) => id !== nextId)
  const index = normalized.indexOf(existingId)
  if (index < 0) return [nextId, ...normalized]
  normalized.splice(index + 1, 0, nextId)
  return normalized
}

function buildRoutineDraft({
  sourceKey,
  routine,
  routineExercises,
  exercises,
  exerciseById,
}: {
  sourceKey: string
  routine?: Routine
  routineExercises?: RoutineExercise[]
  exercises?: Exercise[]
  exerciseById: Map<string, Exercise>
}) {
  const baseExercises = routineExercises?.length
    ? routineExercises.map((item) => buildDraftRoutineExercise(item, exerciseById.get(item.exercise_id) ?? null))
    : (exercises ?? []).map((exercise, index) =>
        buildDraftRoutineExercise(
          {
            id: `draft-${exercise.id}-${index}`,
            routine_id: routine?.id ?? 'draft',
            exercise_id: exercise.id,
            exercise_order: index,
            target_sets: null,
            target_reps: null,
            notes: null,
            created_at: new Date().toISOString(),
          },
          exercise,
        ),
      )

  return {
    sourceKey,
    routineId: routine?.id ?? null,
    title: routine ? 'Edit Routine' : 'New Routine',
    name: routine?.name ?? '',
    notes: routine?.notes ?? '',
    exercises: baseExercises,
  }
}

function buildDraftRoutineExercise(item: RoutineExercise, exercise: Exercise | null): DraftRoutineExercise {
  const target = parseRoutineTarget(item.target_reps)
  return {
    ...item,
    exercise,
    minReps: target.minReps,
    maxReps: target.maxReps,
    targetRpe: target.rpe,
  }
}
