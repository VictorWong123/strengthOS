import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ActiveWorkoutPage } from './components/ActiveWorkoutPage'
import { AnalyticsRoutePage } from './components/AnalyticsRoutePage'
import { AuthView } from './components/AuthView'
import { ExerciseDetails } from './components/ExerciseDetails'
import { ExercisePicker } from './components/ExercisePicker'
import { ExercisesPage } from './components/ExercisesPage'
import { HomePage } from './components/HomePage'
import { OAuthConsentPage } from './components/OAuthConsentPage'
import { ProfilePage } from './components/ProfilePage'
import { PrivacyPage, SupportPage } from './components/PublicInfoPages'
import { RoutineEditorPage } from './components/RoutineEditorPage'
import { RoutineActionList } from './components/RoutineUI'
import { WorkoutPage } from './components/WorkoutPage'
import { WorkoutHistoryPage } from './components/WorkoutHistoryPage'
import {
  AppShell,
  BottomSheet,
  ConfirmDialog,
  DismissibleBanner,
  PrimaryButton,
  SecondaryButton,
} from './components/ui'
import { assignReturnToAfterAuth, logAuthEvent } from './lib/authRedirect'
import { finishPendingAccountCleanup, pendingAccountCleanup } from './lib/accountStorage'
import { accountIsActive, fenceAccountMutations, persistForActiveAccount, requireActiveAccount, setActiveAccount } from './lib/accountFence'
import { dateKeyInTimeZone, DEFAULT_TIME_ZONE, normalizeTimeZone, sundayDateKey } from './lib/dateTime'
import { loadExerciseCatalog } from './lib/exerciseCatalog'
import { clearUserMutations, getSetMutation, listSetMutations, listWorkoutMutations, markWorkoutMutationsConflict, queueSetMutation, queueWorkoutMutation, rebasePendingWorkoutMutations, removeSetMutation, type SetMutation, type WorkoutMutation } from './lib/offlineOutbox'
import { estimatedOneRepMax } from './lib/performance'
import { supabase } from './lib/supabase'
import { formatRoutineTarget, parseRoutineTarget } from './lib/training'
import { exerciseModeKey, isWorkingSet, loadedVolume, warmupSets } from './lib/trainingMetrics'
import type { Exercise, ExerciseSessionEvidence, Routine, RoutineExercise, Workout, WorkoutExercise, WorkoutSet } from './lib/types'

const WORKOUT_COLUMNS = 'id, user_id, name, started_at, completed_at, notes, revision, duration_seconds, paused_at, accumulated_pause_seconds, source, external_id, import_hash'
const WORKOUT_EXERCISE_COLUMNS = 'id, workout_id, exercise_id, exercise_order, notes, logging_mode, target_sets, target_reps, target_rpe, rest_seconds, timer_enabled, session_notes, superset_group, source_name'
const WORKOUT_SET_COLUMNS = 'id, workout_exercise_id, set_order, reps, weight, is_completed, notes, completed_at, set_type, duration_seconds, assistance_weight, bodyweight, rpe, operation_id'
const ROUTINE_COLUMNS = 'id, user_id, name, notes, created_at, updated_at'
const ROUTINE_EXERCISE_COLUMNS = 'id, routine_id, exercise_id, exercise_order, target_sets, target_reps, target_rpe, rest_seconds, timer_enabled, superset_group, notes, created_at'
const REORDER_HINT_KEY = 'strengthos:routine-reorder-hint:dismissed'

type Route =
  | { name: 'home'; pathname: '/' }
  | { name: 'workout'; pathname: '/workout' }
  | { name: 'active-workout'; pathname: '/workout/active' }
  | { name: 'analytics'; pathname: '/analytics' }
  | { name: 'history'; pathname: string; date?: string; workoutId?: string }
  | { name: 'exercises'; pathname: '/exercises' }
  | { name: 'profile'; pathname: '/profile' }
  | { name: 'login'; pathname: '/login' }
  | { name: 'oauth-consent'; pathname: '/oauth/consent' }
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
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  useEffect(() => {
    const userId = pendingAccountCleanup(localStorage)
    if (!userId) return
    void clearUserMutations(userId)
      .then(() => finishPendingAccountCleanup(localStorage, userId))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setActiveAccount(data.session?.user.id ?? null)
        setSession(data.session)
        setIsAuthLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setActiveAccount(null)
        setSession(null)
        setIsAuthLoading(false)
      })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setActiveAccount(nextSession?.user.id ?? null)
      setSession(nextSession)
      setIsAuthLoading(false)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (window.location.pathname === '/oauth/consent') {
    return <OAuthConsentPage session={session} isAuthLoading={isAuthLoading} onNavigate={(pathname) => window.location.assign(pathname)} />
  }
  if (window.location.pathname === '/privacy') {
    return <PrivacyPage onNavigate={(pathname) => window.location.assign(pathname)} />
  }
  if (window.location.pathname === '/support') {
    return <SupportPage onNavigate={(pathname) => window.location.assign(pathname)} />
  }
  if (!session && !isAuthLoading) return <AuthView />
  if (!session) return null
  return <SessionApp key={session.user.id} session={session} />
}

function SessionApp({ session }: { session: Session }) {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [showReorderHint, setShowReorderHint] = useState(() => localStorage.getItem(REORDER_HINT_KEY) !== '1')
  const [routineGroupExpanded, setRoutineGroupExpanded] = useState(true)
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null)
  const [replacementWorkoutExerciseId, setReplacementWorkoutExerciseId] = useState<string | null>(null)
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
  const workoutsRef = useRef<Workout[]>([])
  const mutationQueueRef = useRef(Promise.resolve())
  const mutationPersistenceRef = useRef(new Set<Promise<unknown>>())
  const [setSyncState, setSetSyncState] = useState<Map<string, 'pending' | 'failed'>>(() => new Map())
  const [prAlertsEnabled, setPrAlertsEnabled] = useState(() => localStorage.getItem('strengthos:pr-alerts') !== '0')
  const [accountTimeZone, setAccountTimeZone] = useState(DEFAULT_TIME_ZONE)
  const [conflictedMutations, setConflictedMutations] = useState<SetMutation[]>([])

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
  const previousSessionsByExerciseMode = useMemo(() => {
    const map = new Map<string, ExerciseSessionEvidence[]>()
    const items = [...workoutExercises].sort((a, b) => {
      const left = workoutById.get(a.workout_id)
      const right = workoutById.get(b.workout_id)
      return new Date(right?.completed_at ?? 0).getTime() - new Date(left?.completed_at ?? 0).getTime()
    })
    for (const [key, modeItems] of groupBy(items, (item) => exerciseModeKey(item.exercise_id, item.logging_mode))) {
      const sessions = [...groupBy(modeItems, (item) => item.workout_id)].flatMap(([workoutId, sessionItems]) => {
        const workout = workoutById.get(workoutId)
        const sessionSets = sessionItems.flatMap((item) => setsByWorkoutExerciseId.get(item.id) ?? [])
        return workout?.completed_at && sessionSets.length
          ? [{ workoutId, date: workout.completed_at, sets: sessionSets }]
          : []
      })
      if (sessions.length) map.set(key, sessions)
    }
    return map
  }, [setsByWorkoutExerciseId, workoutById, workoutExercises])
  const previousSessionNoteByExerciseId = useMemo(() => {
    const notes = new Map<string, string>()
    for (const item of [...workoutExercises].sort((a, b) => workoutDateMs(workoutById.get(b.workout_id)!) - workoutDateMs(workoutById.get(a.workout_id)!))) {
      if (workoutById.get(item.workout_id)?.completed_at && item.session_notes && !notes.has(item.exercise_id)) notes.set(item.exercise_id, item.session_notes)
    }
    return notes
  }, [workoutById, workoutExercises])

  const historicalRecordsByExerciseMode = useMemo(() => {
    const map = new Map<string, { maxWeight: number; volume: number }>()

    for (const item of workoutExercises) {
      const workout = workoutById.get(item.workout_id)
      if (!workout?.completed_at) continue

      const completedSets = (setsByWorkoutExerciseId.get(item.id) ?? []).filter(isWorkingSet)
      if (!completedSets.length) continue

      const key = exerciseModeKey(item.exercise_id, item.logging_mode)
      const current = map.get(key) ?? { maxWeight: 0, volume: 0 }
      const maxWeight = ['weight_reps', 'weighted_bodyweight'].includes(item.logging_mode) ? Math.max(...completedSets.map((set) => set.weight ?? 0)) : 0
      const volume = completedSets.reduce((total, set) => total + loadedVolume(set, item.logging_mode), 0)
      map.set(key, {
        maxWeight: Math.max(current.maxWeight, maxWeight),
        volume: Math.max(current.volume, volume),
      })
    }

    return map
  }, [setsByWorkoutExerciseId, workoutById, workoutExercises])

  const completedWorkouts = useMemo(
    () =>
      workouts
        .filter((workout) => workout.completed_at)
        .sort((left, right) => workoutDateMs(right) - workoutDateMs(left)),
    [workouts],
  )

  useEffect(() => {
    workoutsRef.current = workouts
  }, [workouts])
  const weeklyCompletedWorkouts = useMemo(
    () => {
      const weekStart = sundayDateKey(accountTimeZone)
      return completedWorkouts.filter((workout) => dateKeyInTimeZone(workout.completed_at ?? workout.started_at, accountTimeZone) >= weekStart)
    },
    [accountTimeZone, completedWorkouts],
  )
  const weeklySummary = useMemo(() => {
    const weeklyWorkoutIds = new Set(weeklyCompletedWorkouts.map((workout) => workout.id))
    const weeklyWorkoutExerciseById = new Map<string, WorkoutExercise>()
    const completedWorkoutExerciseIds = new Set<string>()
    let poundsLifted = 0
    let bestSet: WorkoutSet | null = null
    let bestExerciseName = ''

    for (const item of workoutExercises) {
      if (weeklyWorkoutIds.has(item.workout_id)) weeklyWorkoutExerciseById.set(item.id, item)
    }

    for (const set of sets) {
      const workoutExercise = weeklyWorkoutExerciseById.get(set.workout_exercise_id)
      if (!workoutExercise || !isWorkingSet(set)) continue
      completedWorkoutExerciseIds.add(workoutExercise.id)
      poundsLifted += loadedVolume(set, workoutExercise.logging_mode)

      if (workoutExercise.logging_mode === 'weight_reps' && (!bestSet || (estimatedOneRepMax(set) ?? 0) > (estimatedOneRepMax(bestSet) ?? 0))) {
        bestSet = set
        bestExerciseName = workoutExercise ? exerciseById.get(workoutExercise.exercise_id)?.name ?? '' : ''
      }
    }

    return {
      workoutCount: weeklyCompletedWorkouts.length,
      poundsLifted,
      exercisesCompleted: completedWorkoutExerciseIds.size,
      biggestPrExercise: bestExerciseName || (bestSet ? 'Unknown exercise' : 'None'),
    }
  }, [exerciseById, sets, weeklyCompletedWorkouts, workoutExercises])

  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
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
  }, [session.user.id])

  useEffect(() => {
    if (!session || !isOnline || isInitialLoading) return
    void listSetMutations(session.user.id).then((operations) => {
      for (const operation of operations) enqueueSetMutation(operation)
    })
    void listWorkoutMutations(session.user.id).then((operations) => {
      for (const operation of operations) enqueueWorkoutMutation(operation)
    })
    void refreshConflicts(session.user.id)
  }, [isInitialLoading, isOnline, session.user.id])

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

    if (route.name === 'routine-new') {
      if (routineDraft?.sourceKey === sourceKey) return
      setRoutineDraft(buildRoutineDraft({ sourceKey, exercises: pendingRoutineExercises, exerciseById }))
      setPendingRoutineExercises([])
      return
    }

    const routine = routineById.get(route.routineId)
    const items = routineExercisesByRoutineId.get(route.routineId) ?? []
    if (!routine) return
    if (routineDraft?.sourceKey === sourceKey && (routineDraft.exercises.length > 0 || items.length === 0)) return

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
      { data: profileRow },
    ] = await Promise.all([
      loadExerciseCatalog(supabase),
      supabase.from('workouts').select(WORKOUT_COLUMNS).order('started_at', { ascending: false }),
      supabase.from('routines').select(ROUTINE_COLUMNS).order('created_at', { ascending: false }),
      supabase.from('profiles').select('timezone').eq('id', session.user.id).maybeSingle(),
    ])

    const loadFailure = exerciseError ?? workoutError ?? routineError
    if (loadFailure) {
      setLoadError(loadFailure.message)
      setIsInitialLoading(false)
      return
    }

    const loadedExercises = (exerciseRows ?? []) as Exercise[]
    setAccountTimeZone(normalizeTimeZone((profileRow as { timezone?: string | null } | null)?.timezone))
    let loadedWorkouts = (workoutRows ?? []) as Workout[]
    const workoutDrafts = await listWorkoutMutations(session.user.id)
    loadedWorkouts = loadedWorkouts.map((workout) => workoutDrafts.filter((draft) => draft.workoutId === workout.id).reduce((current, draft) => ({ ...current, ...draft.patch }), workout) as Workout)
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

    const { data: exerciseRows, error: workoutExerciseError } = await loadSupabaseChildren('workout_exercises', WORKOUT_EXERCISE_COLUMNS, 'workout_id', workoutIds, 'exercise_order')

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

    const { data: setRows, error: setError } = await loadSupabaseChildren('workout_sets', WORKOUT_SET_COLUMNS, 'workout_exercise_id', workoutExerciseIds, 'set_order')

    if (setError) {
      setLoadError(setError.message)
      return false
    }

    let loadedSets = (setRows ?? []) as WorkoutSet[]
    if (session) {
      const pending = await listSetMutations(session.user.id)
      const byId = new Map(loadedSets.map((set) => [set.id, set]))
      for (const operation of pending) {
        const current = byId.get(operation.setId)
        if (current) byId.set(operation.setId, { ...current, ...operation.patch })
        markSetSync(operation.setId, 'pending')
      }
      loadedSets = [...byId.values()]
    }
    setSets(loadedSets)
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
    const exerciseRows: Record<string, unknown>[] = []
    let exerciseError = null
    for (let from = 0; ; from += 1000) {
      const result = await supabase.from('workout_exercises').select(WORKOUT_EXERCISE_COLUMNS).eq('exercise_id', exerciseId).range(from, from + 999)
      if (result.error) { exerciseError = result.error; break }
      exerciseRows.push(...((result.data ?? []) as unknown as Record<string, unknown>[]))
      if ((result.data?.length ?? 0) < 1000) break
    }

    if (requestId !== exerciseHistoryRequestRef.current) return

    if (exerciseError) {
      setStatus({ tone: 'danger', message: exerciseError.message })
      return
    }

    const workoutExerciseIds = (exerciseRows as WorkoutExercise[]).map((item) => item.id)
    if (!workoutExerciseIds.length) {
      if (requestId !== exerciseHistoryRequestRef.current) return
      setSelectedExerciseSets([])
      return
    }

    const { data: setRows, error: setError } = await loadSupabaseChildren('workout_sets', WORKOUT_SET_COLUMNS, 'workout_exercise_id', workoutExerciseIds, 'completed_at')

    if (requestId !== exerciseHistoryRequestRef.current) return

    if (setError) {
      setStatus({ tone: 'danger', message: setError.message })
      return
    }

    setSelectedExerciseSets((setRows ?? []) as WorkoutSet[])
  }

  const navigate = useCallback((nextPath: string) => {
    if (nextPath === pathname) return
    window.history.pushState({}, '', nextPath)
    setPathname(nextPath)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  const navigateFromShell = useCallback((nextPath: string) => {
    navigate(nextPath === '/workout' && activeWorkout ? '/workout/active' : nextPath)
  }, [activeWorkout, navigate])

  async function createWorkout(name = 'Workout', startedAt?: string, backdated = false): Promise<Workout | null> {
    if (!session) return null

    const { data, error } = await supabase
      .from('workouts')
      .insert({ user_id: session.user.id, name, ...(startedAt ? { started_at: startedAt } : {}), ...(backdated && startedAt ? { paused_at: startedAt, duration_seconds: 3600 } : {}) })
      .select(WORKOUT_COLUMNS)
      .single()

    if (error) {
      setStatus({ tone: 'danger', message: error.message })
      return null
    }

    const workout = data as Workout
    setWorkouts((current) => [workout, ...current])
    workoutsRef.current = [workout, ...workoutsRef.current]
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

    const result = await mutateWorkoutExercise(workout.id, 'add', { newId: crypto.randomUUID(), exercise, order: workoutExercisesByWorkoutId.get(workout.id)?.length ?? 0 })
    if (!result?.workout_exercise) return false
    const workoutExercise = result.workout_exercise
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
      logging_mode: exerciseById.get(item.exercise_id)?.logging_mode ?? 'weight_reps',
      target_sets: item.target_sets,
      target_reps: item.target_reps,
      target_rpe: item.target_rpe ?? numberOrNull(parseRoutineTarget(item.target_reps).rpe),
      rest_seconds: item.rest_seconds,
      timer_enabled: item.timer_enabled,
      superset_group: item.superset_group,
      notes: item.notes,
      source_name: exerciseById.get(item.exercise_id)?.name ?? null,
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
      return Array.from({ length: targetSets }, (_, setIndex) => {
        const previousSet = template ? previousSetsByExerciseId.get(template.exercise_id)?.[setIndex] ?? null : null
        return buildSetInsertPayload(item.id, setIndex, previousSet)
      })
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

  async function repeatWorkout(sourceWorkout: Workout): Promise<boolean> {
    if (activeWorkout) {
      setStatus({ tone: 'warning', message: 'Finish or discard the active workout before repeating another session.' })
      navigate('/workout/active')
      return false
    }

    const sourceExercises = workoutExercisesByWorkoutId.get(sourceWorkout.id) ?? []
    if (!sourceExercises.length) {
      setStatus({ tone: 'warning', message: 'This workout has no exercises to repeat.' })
      return false
    }

    const workout = await createWorkout(sourceWorkout.name || 'Workout')
    if (!workout) return false

    const exercisePayload = sourceExercises.map((item) => ({
      workout_id: workout.id,
      exercise_id: item.exercise_id,
      exercise_order: item.exercise_order,
      logging_mode: item.logging_mode,
      target_sets: item.target_sets,
      target_reps: item.target_reps,
      target_rpe: item.target_rpe,
      rest_seconds: item.rest_seconds,
      timer_enabled: item.timer_enabled,
      notes: item.notes,
      superset_group: item.superset_group,
      source_name: item.source_name,
    }))
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_exercises')
      .insert(exercisePayload)
      .select(WORKOUT_EXERCISE_COLUMNS)

    if (exerciseError) {
      setStatus({ tone: 'danger', message: exerciseError.message })
      return false
    }

    const insertedExercises = ((exerciseRows ?? []) as WorkoutExercise[]).sort((left, right) => left.exercise_order - right.exercise_order)
    setWorkoutExercises((current) => [...current, ...insertedExercises])

    const setPayload = insertedExercises.flatMap((insertedExercise, index) => {
      const sourceExercise = sourceExercises[index]
      return (sourceExercise ? setsByWorkoutExerciseId.get(sourceExercise.id) ?? [] : [])
        .sort((left, right) => left.set_order - right.set_order)
        .map((set) => ({
          workout_exercise_id: insertedExercise.id,
          set_order: set.set_order,
          reps: set.reps,
          weight: set.weight,
          duration_seconds: set.duration_seconds,
          assistance_weight: set.assistance_weight,
          bodyweight: set.bodyweight,
          rpe: null,
          set_type: set.set_type,
          operation_id: crypto.randomUUID(),
          is_completed: false,
          notes: set.notes,
          completed_at: null,
        }))
    })

    if (setPayload.length) {
      const { data: setRows, error: setError } = await supabase.from('workout_sets').insert(setPayload).select(WORKOUT_SET_COLUMNS)
      if (setError) {
        setStatus({ tone: 'danger', message: setError.message })
        return false
      }
      setSets((current) => [...current, ...((setRows ?? []) as WorkoutSet[])])
    }

    setStatus({ tone: 'success', message: `${sourceWorkout.name || 'Workout'} ready to repeat.` })
    navigate('/workout/active')
    return true
  }

  async function addSet(workoutExerciseId: string, exerciseId?: string) {
    const currentSets = setsByWorkoutExerciseId.get(workoutExerciseId) ?? []
    const setOrder = currentSets.length
    const workoutExercise = workoutExercises.find((item) => item.id === workoutExerciseId)
    const resolvedExerciseId = exerciseId ?? workoutExercise?.exercise_id
    const historicalDefault = resolvedExerciseId ? previousSetsByExerciseId.get(resolvedExerciseId)?.[setOrder] ?? null : null
    const currentWorkoutDefault = currentSets[setOrder - 1] ?? null
    const defaultSet = historicalDefault ?? currentWorkoutDefault
    const newSet = await addSetValues(workoutExerciseId, buildSetInsertPayload(workoutExerciseId, setOrder, defaultSet))
    if (!newSet) return
    setSets((current) => [...current, newSet])
    if (exerciseId && exerciseId === selectedExercise?.id) {
      setSelectedExerciseSets((current) => [...current, newSet])
    }
  }

  async function addWarmups(workoutExerciseId: string, targetWeight: number, barWeight: number, plates: number[]) {
    const currentSets = setsByWorkoutExerciseId.get(workoutExerciseId) ?? []
    const payload = warmupSets(targetWeight, plates, barWeight).map((warmup, index) => ({
      ...buildSetInsertPayload(workoutExerciseId, currentSets.length + index, null),
      weight: warmup.weight,
      reps: warmup.reps,
      set_type: 'warmup',
    }))
    if (!payload.length) return
    const inserted: WorkoutSet[] = []
    for (const values of payload) {
      const saved = await addSetValues(workoutExerciseId, values)
      if (!saved) break
      inserted.push(saved)
    }
    if (inserted.length) setSets((current) => [...current, ...inserted])
  }

  async function addSetValues(workoutExerciseId: string, values: ReturnType<typeof buildSetInsertPayload>) {
    const item = workoutExercises.find((candidate) => candidate.id === workoutExerciseId)
    if (!item) return null
    const operationId = crypto.randomUUID()
    const task = mutationQueueRef.current.catch(() => undefined).then(async () => {
      requireActiveAccount(session.user.id)
      const workout = workoutsRef.current.find((candidate) => candidate.id === item.workout_id)
      if (!workout) throw new Error('Workout not found.')
      const { data, error } = await supabase.rpc('add_workout_set', {
        p_workout_id: workout.id,
        p_workout_exercise_id: workoutExerciseId,
        p_set_id: values.id,
        p_expected_revision: workout.revision,
        p_operation_id: operationId,
        p_values: { weight: values.weight, reps: values.reps, duration_seconds: values.duration_seconds, assistance_weight: values.assistance_weight, bodyweight: values.bodyweight, rpe: values.rpe, set_type: values.set_type },
      })
      let result = data as { set: WorkoutSet; revision: number } | null
      requireActiveAccount(session.user.id)
      if (error) {
        const [{ data: existing, error: lookupError }, { data: latestWorkout }] = await Promise.all([
          supabase.from('workout_sets').select(WORKOUT_SET_COLUMNS).eq('id', values.id).maybeSingle(),
          supabase.from('workouts').select('revision').eq('id', workout.id).maybeSingle(),
        ])
        if (lookupError || !existing || !latestWorkout) throw new Error(error.message)
        result = { set: existing as WorkoutSet, revision: latestWorkout.revision as number }
      }
      if (!result) throw new Error('Set could not be added.')
      setWorkouts((current) => current.map((candidate) => candidate.id === workout.id ? { ...candidate, revision: result.revision } : candidate))
      workoutsRef.current = workoutsRef.current.map((candidate) => candidate.id === workout.id ? { ...candidate, revision: result.revision } : candidate)
      return result.set
    })
    mutationQueueRef.current = task.then(() => undefined)
    try { return await task } catch (error) { setStatus({ tone: 'danger', message: error instanceof Error ? error.message : 'Set could not be added.' }); return null }
  }

  async function updateSet(set: WorkoutSet, patch: Partial<WorkoutSet>) {
    const next = { ...set, ...patch }
    setSets((current) => current.map((candidate) => (candidate.id === set.id ? next : candidate)))
    setSelectedExerciseSets((current) => current.map((candidate) => (candidate.id === set.id ? next : candidate)))

    const workoutExercise = workoutExercises.find((item) => item.id === set.workout_exercise_id)
    const workout = workoutExercise ? workoutById.get(workoutExercise.workout_id) : null
    if (!session || !workout) return
    const operation: SetMutation = {
      operationId: crypto.randomUUID(),
      userId: session.user.id,
      workoutId: workout.id,
      setId: set.id,
      expectedRevision: workout.revision,
      patch,
      createdAt: new Date().toISOString(),
    }
    try {
      const persisted = await persistActiveMutation(operation.userId, operation.operationId, () => queueSetMutation(operation))
      if (!persisted) return
      markSetSync(set.id, 'pending')
      if (navigator.onLine) enqueueSetMutation(operation)
    } catch {
      setSets((current) => current.map((candidate) => (candidate.id === set.id ? set : candidate)))
      setSelectedExerciseSets((current) => current.map((candidate) => (candidate.id === set.id ? set : candidate)))
      setStatus({ tone: 'danger', message: 'Unable to preserve this edit for retry.' })
    }
  }

  function enqueueSetMutation(operation: SetMutation) {
    mutationQueueRef.current = mutationQueueRef.current
      .catch(() => undefined)
      .then(() => saveSetMutation(operation))
      .catch(() => {
        markSetSync(operation.setId, 'failed')
        setStatus({ tone: 'danger', message: 'Edit preserved. It will retry when the connection returns.' })
      })
  }

  async function saveSetMutation(operation: SetMutation) {
    const persisted = await getSetMutation(operation.operationId)
    if (!persisted || persisted.state === 'conflict') return
    operation = persisted
    const firstForWorkout = (await listSetMutations(operation.userId)).find((candidate) => candidate.workoutId === operation.workoutId)
    if (firstForWorkout?.operationId !== operation.operationId) return
    const workout = workoutsRef.current.find((item) => item.id === operation.workoutId)
    if (!workout) return
    requireActiveAccount(operation.userId)
    const { data, error } = await supabase.rpc('save_workout_set', {
      p_workout_id: operation.workoutId,
      p_set_id: operation.setId,
      p_expected_revision: operation.expectedRevision,
      p_operation_id: operation.operationId,
      p_patch: operation.patch,
    })
    requireActiveAccount(operation.userId)
    if (error) {
      markSetSync(operation.setId, 'failed')
      setStatus({
        tone: error.code === '40001' ? 'warning' : 'danger',
        message: error.code === '40001' ? 'Workout changed elsewhere. Reloaded latest data; review the failed edit.' : error.message,
      })
      if (error.code === '40001') await loadData(false)
      if (error.code === '40001') {
        await markWorkoutMutationsConflict(operation.userId, operation.workoutId)
        await refreshConflicts(operation.userId)
      }
      return
    }
    const result = data as { set: WorkoutSet; revision: number }
    const workoutExercise = workoutExercises.find((item) => item.id === result.set.workout_exercise_id)
    const priorSets = workoutExercise ? sets.filter((candidate) => candidate.id !== result.set.id && isWorkingSet(candidate) &&
      workoutExercises.some((item) => item.id === candidate.workout_exercise_id && item.exercise_id === workoutExercise.exercise_id && item.logging_mode === workoutExercise.logging_mode && workoutById.get(item.workout_id)?.completed_at)) : []
    const record = workoutExercise && isWorkingSet(result.set) ? describeLiveRecord(result.set, priorSets, workoutExercise.logging_mode) : null
    setWorkouts((current) => current.map((candidate) => candidate.id === operation.workoutId ? { ...candidate, revision: result.revision } : candidate))
    workoutsRef.current = workoutsRef.current.map((candidate) => candidate.id === operation.workoutId ? { ...candidate, revision: result.revision } : candidate)
    await removeSetMutation(operation.operationId)
    await rebasePendingWorkoutMutations(operation.userId, operation.workoutId, result.revision)
    const later = (await listSetMutations(operation.userId)).filter((candidate) => candidate.setId === operation.setId)
    const visibleSet = later.reduce((current, candidate) => ({ ...current, ...candidate.patch }), result.set)
    setSets((current) => current.map((candidate) => candidate.id === operation.setId ? visibleSet : candidate))
    setSelectedExerciseSets((current) => current.map((candidate) => candidate.id === operation.setId ? visibleSet : candidate))
    if (record && prAlertsEnabled) setStatus({ tone: 'success', message: `New personal record: ${record}.` })
    setSetSyncState((current) => {
      const next = new Map(current)
      if (later.length) next.set(operation.setId, 'pending')
      else next.delete(operation.setId)
      return next
    })
  }

  function markSetSync(setId: string, state: 'pending' | 'failed') {
    setSetSyncState((current) => new Map(current).set(setId, state))
  }

  async function refreshConflicts(userId: string) {
    const operations = await listSetMutations(userId, true)
    setConflictedMutations(operations.filter((operation) => operation.state === 'conflict'))
  }

  async function retryConflicts() {
    for (const conflict of conflictedMutations) {
      const operation = { ...conflict, operationId: crypto.randomUUID(), expectedRevision: workoutsRef.current.find((item) => item.id === conflict.workoutId)?.revision ?? conflict.expectedRevision, state: 'pending' as const, createdAt: new Date().toISOString() }
      const persisted = await persistActiveMutation(operation.userId, operation.operationId, () => queueSetMutation(operation))
      if (!persisted) return
      await removeSetMutation(conflict.operationId)
      markSetSync(operation.setId, 'pending')
      enqueueSetMutation(operation)
    }
    setConflictedMutations([])
  }

  async function discardConflicts() {
    await Promise.all(conflictedMutations.map((operation) => removeSetMutation(operation.operationId)))
    setConflictedMutations([])
  }

  async function deleteSet(set: WorkoutSet) {
    if (!session) return
    const item = workoutExercises.find((candidate) => candidate.id === set.workout_exercise_id)
    if (!item) return
    const pending = (await listSetMutations(session.user.id, true)).some((operation) => operation.setId === set.id)
    if (pending) { setStatus({ tone: 'warning', message: 'Resolve this set’s unsaved edit before deleting it.' }); return }
    const task = mutationQueueRef.current.catch(() => undefined).then(async () => {
      requireActiveAccount(session.user.id)
      const workout = workoutsRef.current.find((candidate) => candidate.id === item.workout_id)
      if (!workout) throw new Error('Workout not found.')
      const { data, error } = await supabase.rpc('delete_workout_set', { p_workout_id: workout.id, p_set_id: set.id, p_expected_revision: workout.revision, p_operation_id: crypto.randomUUID() })
      let result = data as { revision: number } | null
      requireActiveAccount(session.user.id)
      if (error) {
        const [{ data: existing, error: lookupError }, { data: latestWorkout }] = await Promise.all([
          supabase.from('workout_sets').select('id').eq('id', set.id).maybeSingle(),
          supabase.from('workouts').select('revision').eq('id', workout.id).maybeSingle(),
        ])
        if (lookupError || existing || !latestWorkout) throw new Error(error.message)
        result = { revision: latestWorkout.revision as number }
      }
      if (!result) throw new Error('Set could not be deleted.')
      setWorkouts((current) => current.map((candidate) => candidate.id === workout.id ? { ...candidate, revision: result.revision } : candidate))
      workoutsRef.current = workoutsRef.current.map((candidate) => candidate.id === workout.id ? { ...candidate, revision: result.revision } : candidate)
    })
    mutationQueueRef.current = task
    try {
      await task
      setSets((current) => current.filter((candidate) => candidate.id !== set.id))
      setSelectedExerciseSets((current) => current.filter((candidate) => candidate.id !== set.id))
    } catch (error) { setStatus({ tone: 'danger', message: error instanceof Error ? error.message : 'Set could not be deleted.' }) }
  }

  async function updateWorkout(workout: Workout, patch: Partial<Workout>) {
    const next = { ...workout, ...patch }
    setWorkouts((current) => current.map((candidate) => (candidate.id === workout.id ? next : candidate)))
    if (!session) return
    const operation: WorkoutMutation = { kind: 'workout', operationId: crypto.randomUUID(), userId: session.user.id, workoutId: workout.id, expectedRevision: workout.revision, patch, createdAt: new Date().toISOString() }
    try {
      const persisted = await persistActiveMutation(operation.userId, operation.operationId, () => queueWorkoutMutation(operation))
      if (persisted) enqueueWorkoutMutation(operation)
    } catch {
      setStatus({ tone: 'danger', message: 'Unable to preserve workout changes for retry.' })
    }
  }

  function persistActiveMutation(userId: string, operationId: string, persist: () => Promise<unknown>) {
    const task = persistForActiveAccount(userId, operationId, persist, removeSetMutation)
    mutationPersistenceRef.current.add(task)
    void task.then(
      () => mutationPersistenceRef.current.delete(task),
      () => mutationPersistenceRef.current.delete(task),
    )
    return task
  }

  function enqueueWorkoutMutation(operation: WorkoutMutation) {
    mutationQueueRef.current = mutationQueueRef.current.catch(() => undefined).then(async () => {
      const queued = (await listWorkoutMutations(operation.userId)).find((item) => item.operationId === operation.operationId)
      if (!queued) return
      const firstForWorkout = (await listWorkoutMutations(operation.userId)).find((item) => item.workoutId === operation.workoutId)
      if (firstForWorkout?.operationId !== queued.operationId) return
      requireActiveAccount(operation.userId)
      const { data, error } = await supabase.rpc('save_workout', { p_workout_id: queued.workoutId, p_expected_revision: queued.expectedRevision, p_operation_id: queued.operationId, p_patch: queued.patch })
      requireActiveAccount(operation.userId)
      if (error) { setStatus({ tone: error.code === '40001' ? 'warning' : 'danger', message: error.code === '40001' ? 'Workout changed elsewhere. Review the preserved draft.' : 'Workout change preserved and will retry.' }); return }
      const result = data as { workout: Workout; revision: number }
      await removeSetMutation(queued.operationId)
      const later = (await listWorkoutMutations(queued.userId)).filter((item) => item.workoutId === queued.workoutId)
      for (const item of later) await queueWorkoutMutation({ ...item, expectedRevision: result.revision })
      const visible = later.reduce((current, item) => ({ ...current, ...item.patch }), result.workout) as Workout
      setWorkouts((items) => items.map((item) => item.id === queued.workoutId ? visible : item))
      workoutsRef.current = workoutsRef.current.map((item) => item.id === queued.workoutId ? result.workout : item)
    })
  }

  async function saveWorkoutPatch(workoutId: string, patch: Partial<Workout>) {
    if (!accountIsActive(session.user.id)) return false
    const current = workoutsRef.current.find((workout) => workout.id === workoutId)
    if (!current) return false
    const { data, error } = await supabase.rpc('save_workout', {
      p_workout_id: workoutId,
      p_expected_revision: current.revision,
      p_operation_id: crypto.randomUUID(),
      p_patch: patch,
    })
    if (error) {
      setStatus({ tone: error.code === '40001' ? 'warning' : 'danger', message: error.code === '40001' ? 'Workout changed elsewhere. Latest version loaded.' : error.message })
      if (error.code === '40001') await loadData(false)
      return false
    }
    const result = data as { workout: Workout; revision: number }
    setWorkouts((items) => items.map((item) => item.id === workoutId ? result.workout : item))
    workoutsRef.current = workoutsRef.current.map((item) => item.id === workoutId ? result.workout : item)
    return true
  }

  async function finishWorkout() {
    if (!activeWorkout) return
    await mutationQueueRef.current.catch(() => undefined)
    if (!accountIsActive(session.user.id)) return
    if (session) {
      const outstanding = (await listSetMutations(session.user.id, true)).filter((operation) => operation.workoutId === activeWorkout.id)
      const workoutOutstanding = (await listWorkoutMutations(session.user.id)).filter((operation) => operation.workoutId === activeWorkout.id)
      if (outstanding.length || workoutOutstanding.length) {
        setStatus({ tone: 'warning', message: 'Resolve unsaved workout edits before finishing this workout.' })
        return
      }
    }
    const started = new Date(activeWorkout.started_at)
    const isBackdated = started.toDateString() !== new Date().toDateString()
    const ongoingPauseSeconds = activeWorkout.paused_at ? Math.max(0, Math.round((Date.now() - new Date(activeWorkout.paused_at).getTime()) / 1000)) : 0
    const durationSeconds = isBackdated ? (activeWorkout.duration_seconds ?? 3600) : Math.max(0, Math.round((Date.now() - started.getTime()) / 1000) - activeWorkout.accumulated_pause_seconds - ongoingPauseSeconds)
    const completedAt = isBackdated ? new Date(started.getTime() + durationSeconds * 1000).toISOString() : new Date().toISOString()
    if (!await saveWorkoutPatch(activeWorkout.id, { completed_at: completedAt, duration_seconds: durationSeconds, paused_at: null })) return

    setStatus({ tone: 'success', message: 'Workout finished.' })
    navigate('/workout')
  }

  async function discardWorkout() {
    if (!activeWorkout) return
    await mutationQueueRef.current.catch(() => undefined)
    if (!accountIsActive(session.user.id)) return
    const queuedForWorkout = session ? (await listSetMutations(session.user.id, true)).filter((operation) => operation.workoutId === activeWorkout.id) : []
    const queuedWorkoutChanges = session ? (await listWorkoutMutations(session.user.id)).filter((operation) => operation.workoutId === activeWorkout.id) : []

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

    await Promise.all([...queuedForWorkout, ...queuedWorkoutChanges].map((operation) => removeSetMutation(operation.operationId)))
    if (session) await refreshConflicts(session.user.id)

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
        target_rpe: item.target_rpe,
        rest_seconds: item.rest_seconds,
        timer_enabled: item.timer_enabled,
        superset_group: item.superset_group,
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

  function reorderRoutines(routineIds: string[]) {
    const next = mergeRoutineOrder(routineIds, routines.map((routine) => routine.id))
    persistRoutineOrder(session?.user.id, next)
    setRoutineOrder(next)
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

    if (replacementWorkoutExerciseId) {
      const target = workoutExercises.find((item) => item.id === replacementWorkoutExerciseId)
      setReplacementWorkoutExerciseId(null)
      setPickerMode(null)
      if (target) await replaceWorkoutExercise(target, exercise)
      return
    }

    setPickerMode(null)
    const added = await addExerciseToWorkout(exercise, true)
    if (!added) setPickerMode('workout')
  }

  async function replaceWorkoutExercise(target: WorkoutExercise, exercise: Exercise) {
    if (await hasPendingMutationsForExercise(target.id)) { setStatus({ tone: 'warning', message: 'Resolve unsaved set edits before replacing this exercise.' }); return }
    const completed = (setsByWorkoutExerciseId.get(target.id) ?? []).some((set) => set.is_completed)
    const result = await mutateWorkoutExercise(target.workout_id, 'replace', { targetId: target.id, newId: crypto.randomUUID(), exercise })
    if (!result?.workout_exercise) return
    const inserted = result.workout_exercise
    setWorkoutExercises((current) => [...current.filter((item) => item.id !== result.removed_id), inserted])
    if (result.removed_id) setSets((current) => current.filter((set) => set.workout_exercise_id !== result.removed_id))
    await addSet(inserted.id, exercise.id)
    setStatus({ tone: 'success', message: completed ? 'Replacement added; completed work kept.' : 'Exercise replaced.' })
  }

  async function removeWorkoutExercise(item: WorkoutExercise) {
    if ((setsByWorkoutExerciseId.get(item.id) ?? []).some((set) => set.is_completed)) {
      setStatus({ tone: 'warning', message: 'Completed work is preserved. Delete its sets before removing the exercise.' })
      return
    }
    if (await hasPendingMutationsForExercise(item.id)) { setStatus({ tone: 'warning', message: 'Resolve unsaved set edits before removing this exercise.' }); return }
    const result = await mutateWorkoutExercise(item.workout_id, 'remove', { targetId: item.id })
    if (!result) return
    setWorkoutExercises((current) => current.filter((candidate) => candidate.id !== item.id))
    setSets((current) => current.filter((set) => set.workout_exercise_id !== item.id))
  }

  async function hasPendingMutationsForExercise(workoutExerciseId: string) {
    if (!session) return false
    const setIds = new Set((setsByWorkoutExerciseId.get(workoutExerciseId) ?? []).map((set) => set.id))
    return (await listSetMutations(session.user.id, true)).some((operation) => setIds.has(operation.setId))
  }

  async function mutateWorkoutExercise(workoutId: string, action: 'add' | 'remove' | 'replace', options: { targetId?: string; newId?: string; exercise?: Exercise; order?: number }) {
    const task = mutationQueueRef.current.catch(() => undefined).then(async () => {
      requireActiveAccount(session.user.id)
      const workout = workoutsRef.current.find((candidate) => candidate.id === workoutId)
      if (!workout) throw new Error('Workout not found.')
      const { data, error } = await supabase.rpc('mutate_workout_exercise', {
        p_workout_id: workoutId, p_expected_revision: workout.revision, p_operation_id: crypto.randomUUID(), p_action: action,
        p_target_id: options.targetId ?? null, p_new_id: options.newId ?? null, p_exercise_id: options.exercise?.id ?? null,
        p_exercise_order: options.order ?? null, p_logging_mode: options.exercise?.logging_mode ?? null, p_source_name: options.exercise?.name ?? null,
      })
      requireActiveAccount(session.user.id)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      const result = data as { workout_exercise: WorkoutExercise | null; removed_id: string | null; revision: number }
      setWorkouts((current) => current.map((candidate) => candidate.id === workoutId ? { ...candidate, revision: result.revision } : candidate))
      workoutsRef.current = workoutsRef.current.map((candidate) => candidate.id === workoutId ? { ...candidate, revision: result.revision } : candidate)
      return result
    })
    mutationQueueRef.current = task.then(() => undefined)
    try { return await task } catch (error) {
      const conflict = error instanceof Error && 'code' in error && error.code === '40001'
      setStatus({ tone: conflict ? 'warning' : 'danger', message: conflict ? 'Workout changed elsewhere. Latest version loaded.' : error instanceof Error ? error.message : 'Exercise change could not be saved.' })
      if (conflict) await loadData(false)
      return null
    }
  }

  async function moveWorkoutExercise(item: WorkoutExercise, direction: -1 | 1) {
    const items = [...(workoutExercisesByWorkoutId.get(item.workout_id) ?? [])].sort((a, b) => a.exercise_order - b.exercise_order)
    const index = items.findIndex((candidate) => candidate.id === item.id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return
    ;[items[index], items[nextIndex]] = [items[nextIndex], items[index]]
    const reordered = items.map((candidate, order) => ({ ...candidate, exercise_order: order }))
    setWorkoutExercises((current) => current.map((candidate) => reordered.find((row) => row.id === candidate.id) ?? candidate))
    const saved = await saveWorkoutExercisePatches(item.workout_id, reordered.map((candidate) => ({ id: candidate.id, exercise_order: candidate.exercise_order })))
    if (!saved) {
      await loadData(false)
    }
  }

  async function updateWorkoutExercise(item: WorkoutExercise, patch: Partial<WorkoutExercise>) {
    const previous = item
    setWorkoutExercises((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...patch } : candidate))
    const saved = await saveWorkoutExercisePatches(item.workout_id, [{ id: item.id, ...patch }])
    if (!saved) {
      setWorkoutExercises((current) => current.map((candidate) => candidate.id === item.id ? previous : candidate))
    }
  }

  async function saveWorkoutExercisePatches(workoutId: string, patches: Array<Record<string, unknown>>) {
    const task = mutationQueueRef.current.catch(() => undefined).then(async () => {
      requireActiveAccount(session.user.id)
      const workout = workoutsRef.current.find((candidate) => candidate.id === workoutId)
      if (!workout) throw new Error('Workout not found.')
      const { data, error } = await supabase.rpc('save_workout_exercises', { p_workout_id: workoutId, p_expected_revision: workout.revision, p_operation_id: crypto.randomUUID(), p_patches: patches })
      requireActiveAccount(session.user.id)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      const result = data as { workout_exercises: WorkoutExercise[]; revision: number }
      setWorkoutExercises((current) => current.map((candidate) => result.workout_exercises.find((saved) => saved.id === candidate.id) ?? candidate))
      setWorkouts((current) => current.map((candidate) => candidate.id === workoutId ? { ...candidate, revision: result.revision } : candidate))
      workoutsRef.current = workoutsRef.current.map((candidate) => candidate.id === workoutId ? { ...candidate, revision: result.revision } : candidate)
      return true
    })
    mutationQueueRef.current = task.then(() => undefined)
    try { return await task } catch (error) {
      const conflict = error instanceof Error && 'code' in error && error.code === '40001'
      setStatus({ tone: conflict ? 'warning' : 'danger', message: conflict ? 'Workout changed elsewhere. Latest version loaded.' : error instanceof Error ? error.message : 'Exercise change could not be saved.' })
      if (conflict) await loadData(false)
      return false
    }
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
        target_rpe: null,
        rest_seconds: null,
        timer_enabled: true,
        superset_group: null,
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
        rpe: '',
      }),
      target_rpe: numberOrNull(item.targetRpe),
      rest_seconds: item.rest_seconds,
      timer_enabled: item.timer_enabled,
      superset_group: item.superset_group,
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
    patch: Partial<Pick<DraftRoutineExercise, 'target_sets' | 'minReps' | 'maxReps' | 'targetRpe' | 'rest_seconds' | 'timer_enabled'>>,
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

  if (route.name === 'oauth-consent') return <OAuthConsentPage session={session} isAuthLoading={false} onNavigate={navigate} />
  if (route.name === 'login') {
    return <LoginSessionRedirect />
  }

  return (
    <AppShell currentPath={route.pathname} onNavigate={navigateFromShell}>
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
            onEdit={() => openRoutineForEdit(routineActionTarget.id)}
            onDuplicate={() => void duplicateRoutine(routineActionTarget)}
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
          workouts={workouts}
          workoutExercises={workoutExercises}
          open={Boolean(selectedExercise)}
          onClose={() => setSelectedExercise(null)}
          onOpenWorkout={(workoutId) => navigate(`/history/workout/${workoutId}`)}
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

    return (
      <PrimaryButton
        onClick={() => {
          setSelectedExercise(null)
          setPickerMode(null)
          void addExerciseToWorkout(exercise, true)
        }}
      >
        Add to Workout
      </PrimaryButton>
    )
  }

  function renderPage() {
    switch (route.name) {
      case 'home':
        return (
          <HomePage
            banners={renderBanners()}
            completedWorkouts={completedWorkouts}
            workoutExercises={workoutExercises}
            sets={sets}
            exerciseById={exerciseById}
            weeklySummary={weeklySummary}
            onOpenProfile={() => navigate('/profile')}
            onOpenHistory={() => navigate('/history')}
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
            onReorderRoutines={reorderRoutines}
          />
        )

      case 'active-workout':
        return (
          <ActiveWorkoutPage
            banners={renderBanners()}
            isLoading={isInitialLoading}
            workout={activeWorkout}
            workoutExercises={activeWorkoutExercises}
            sets={activeWorkoutSets}
            exerciseById={exerciseById}
            previousSetsByExerciseId={previousSetsByExerciseId}
            previousSessionsByExerciseMode={previousSessionsByExerciseMode}
            previousSessionNoteByExerciseId={previousSessionNoteByExerciseId}
            historicalRecordsByExerciseMode={historicalRecordsByExerciseMode}
            onCreateWorkout={() => void startEmptyWorkout()}
            onOpenExercisePicker={openWorkoutPicker}
            onOpenExerciseDetails={(exercise) => openExerciseDetails(exercise, 'active-workout')}
            onAddSet={(workoutExerciseId) => void addSet(workoutExerciseId)}
            onAddWarmups={(workoutExerciseId, targetWeight, barWeight, plates) => void addWarmups(workoutExerciseId, targetWeight, barWeight, plates)}
            onReplaceExercise={(item) => {
              setReplacementWorkoutExerciseId(item.id)
              setPickerMode('workout')
            }}
            onRemoveExercise={(item) => void removeWorkoutExercise(item)}
            onMoveExercise={(item, direction) => void moveWorkoutExercise(item, direction)}
            onUpdateWorkoutExercise={(item, patch) => void updateWorkoutExercise(item, patch)}
            onUpdateSet={(set, patch) => void updateSet(set, patch)}
            onDeleteSet={(set) => void deleteSet(set)}
            onFinishWorkout={() => void finishWorkout()}
            onDiscardWorkout={() => void discardWorkout()}
            onUpdateWorkout={(workout, patch) => void updateWorkout(workout, patch)}
            setSyncState={setSyncState}
            prAlertsEnabled={prAlertsEnabled}
            onTogglePrAlerts={() => setPrAlertsEnabled((current) => { const next = !current; localStorage.setItem('strengthos:pr-alerts', next ? '1' : '0'); return next })}
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
            onSelectWorkoutDate={(date) => navigate(`/history/${date}`)}
            timeZone={accountTimeZone}
          />
        )

      case 'history':
        return (
          <WorkoutHistoryPage
            banners={renderBanners()}
            completedWorkouts={completedWorkouts}
            workoutExercises={workoutExercises}
            sets={sets}
            exerciseById={exerciseById}
            isLoading={isInitialLoading}
            loadError={loadError}
            initialDate={route.date}
            initialWorkoutId={route.workoutId}
            onBack={() => navigate('/')}
            onRetry={() => void loadData(true)}
            onRepeat={repeatWorkout}
            onUpdateWorkout={(workout, patch) => void updateWorkout(workout, patch)}
            onUpdateSet={(set, patch) => void updateSet(set, patch)}
            onCreateBackdated={async (date) => {
              if (activeWorkout) {
                setStatus({ tone: 'warning', message: 'Finish or discard the active workout first.' })
                return
              }
              const startedAt = new Date(`${date}T12:00:00`).toISOString()
              const workout = await createWorkout('Workout', startedAt, true)
              if (workout) navigate('/workout/active')
            }}
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
            workouts={workouts}
            workoutExercises={workoutExercises}
            sets={sets}
            onNavigate={navigate}
            onStatus={setStatus}
            onPrepareAccountDeletion={() => fenceAccountMutations(session.user.id, () => [mutationQueueRef.current, ...mutationPersistenceRef.current])}
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
        {conflictedMutations.length ? (
          <DismissibleBanner tone="warning">
            <div className="space-y-2">
              <p>{conflictedMutations.length} edit{conflictedMutations.length === 1 ? '' : 's'} conflict with newer workout data.</p>
              <div className="flex gap-3 text-sm font-semibold"><button type="button" onClick={() => void retryConflicts()}>Apply mine</button><button type="button" onClick={() => void discardConflicts()}>Keep latest</button></div>
            </div>
          </DismissibleBanner>
        ) : null}
      </div>
    )
  }
}

function LoginSessionRedirect() {
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (hasRedirected.current) return
    hasRedirected.current = true
    logAuthEvent('App login session guard redirect')
    assignReturnToAfterAuth('App.loginSessionGuard')
  }, [])

  return null
}

function parseRoute(pathname: string): Route {
  if (pathname === '/workout') return { name: 'workout', pathname }
  if (pathname === '/workout/active') return { name: 'active-workout', pathname }
  if (pathname === '/analytics') return { name: 'analytics', pathname }
  if (pathname === '/history') return { name: 'history', pathname }
  if (pathname === '/exercises') return { name: 'exercises', pathname }
  if (pathname === '/profile') return { name: 'profile', pathname }
  if (pathname === '/login') return { name: 'login', pathname }
  if (pathname === '/oauth/consent') return { name: 'oauth-consent', pathname }
  if (pathname === '/routines/new') return { name: 'routine-new', pathname }

  const historyDateMatch = pathname.match(/^\/history\/(\d{4}-\d{2}-\d{2})$/)
  if (historyDateMatch) return { name: 'history', pathname, date: historyDateMatch[1] }

  const historyWorkoutMatch = pathname.match(/^\/history\/workout\/([^/]+)$/)
  if (historyWorkoutMatch) return { name: 'history', pathname, workoutId: historyWorkoutMatch[1] }

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

function workoutDateMs(workout: Workout) {
  return new Date(workout.completed_at ?? workout.started_at).getTime()
}

function describeLiveRecord(set: WorkoutSet, prior: WorkoutSet[], mode: WorkoutExercise['logging_mode']) {
  if (mode === 'duration' && set.duration_seconds !== null && set.duration_seconds > Math.max(0, ...prior.map((item) => item.duration_seconds ?? 0))) return `${set.duration_seconds} seconds`
  if (mode === 'bodyweight_reps' && set.reps !== null && set.reps > Math.max(0, ...prior.map((item) => item.reps ?? 0))) return `${set.reps} reps`
  if (mode === 'assisted_bodyweight' && set.assistance_weight !== null && set.reps !== null && set.reps > 0) {
    const comparable = prior.filter((item) => (item.reps ?? 0) >= (set.reps ?? 0) && item.assistance_weight !== null)
    if (!comparable.length || set.assistance_weight < Math.min(...comparable.map((item) => item.assistance_weight as number))) return `${set.reps} reps with ${set.assistance_weight} lb assistance`
  }
  if ((mode === 'weight_reps' || mode === 'weighted_bodyweight') && set.weight !== null && set.reps !== null) {
    const sameLoadBest = Math.max(0, ...prior.filter((item) => item.weight === set.weight).map((item) => item.reps ?? 0))
    if (set.reps > sameLoadBest) return `${set.weight} lb for ${set.reps} reps`
  }
  return null
}


async function loadSupabaseChildren(
  table: 'workout_exercises' | 'workout_sets',
  columns: string,
  foreignKey: 'workout_id' | 'workout_exercise_id',
  ids: string[],
  order: string,
) {
  const data: Record<string, unknown>[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    for (let from = 0; ; from += 1000) {
      const result = await supabase.from(table).select(columns).in(foreignKey, batch).order(order).range(from, from + 999)
      if (result.error) return { data: null, error: result.error }
      data.push(...((result.data ?? []) as unknown as Record<string, unknown>[]))
      if ((result.data?.length ?? 0) < 1000) break
    }
  }
  return { data, error: null }
}

function buildSetInsertPayload(workoutExerciseId: string, setOrder: number, defaultSet: WorkoutSet | null) {
  return {
    id: crypto.randomUUID(),
    workout_exercise_id: workoutExerciseId,
    set_order: setOrder,
    weight: defaultSet?.weight ?? null,
    reps: defaultSet?.reps ?? null,
    duration_seconds: defaultSet?.duration_seconds ?? null,
    assistance_weight: defaultSet?.assistance_weight ?? null,
    bodyweight: defaultSet?.bodyweight ?? null,
    rpe: null,
    set_type: 'working',
    operation_id: crypto.randomUUID(),
  }
}

function numberOrNull(value: string) {
  const number = Number(value)
  return value.trim() && Number.isFinite(number) ? number : null
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
        target_rpe: null,
        rest_seconds: null,
        timer_enabled: true,
        superset_group: null,
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
    targetRpe: item.target_rpe === null ? target.rpe : String(item.target_rpe),
  }
}
