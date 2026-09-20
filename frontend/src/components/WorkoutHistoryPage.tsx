import { AlertTriangle, CalendarDays, CalendarX2, ChevronLeft, ChevronRight, List, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { BackButton, BottomSheet, EmptyState, ErrorState, Input, MobileHeader, SecondaryButton, SurfaceCard, cn } from './ui'
import { WorkoutDetails, WorkoutSummaryRow, buildWorkoutDetailsByWorkoutId, formatWorkoutDate, getWorkoutDetails, workoutDateKey } from './WorkoutHistoryUI'

const PAGE_SIZE = 20
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type WorkoutHistoryPageProps = {
  banners: ReactNode
  completedWorkouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  exerciseById: Map<string, Exercise>
  isLoading: boolean
  loadError: string | null
  initialDate?: string
  initialWorkoutId?: string
  onBack: () => void
  onRetry: () => void
  onRepeat: (workout: Workout) => Promise<boolean>
  onUpdateWorkout: (workout: Workout, patch: Partial<Workout>) => void
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onCreateBackdated: (date: string) => Promise<void>
}

export function WorkoutHistoryPage({
  banners,
  completedWorkouts,
  workoutExercises,
  sets,
  exerciseById,
  isLoading,
  loadError,
  initialDate,
  initialWorkoutId,
  onBack,
  onRetry,
  onRepeat,
  onUpdateWorkout,
  onUpdateSet,
  onCreateBackdated,
}: WorkoutHistoryPageProps) {
  const [view, setView] = useState<'list' | 'calendar'>(initialDate ? 'calendar' : 'list')
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedDate, setSelectedDate] = useState(initialDate ?? '')
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)
  const [isRepeating, setIsRepeating] = useState(false)
  const [backdatedDate, setBackdatedDate] = useState('')
  const initialMonth = parseDateKey(initialDate) ?? new Date()
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))

  const detailsByWorkoutId = useMemo(
    () => buildWorkoutDetailsByWorkoutId(completedWorkouts, workoutExercises, sets, exerciseById),
    [completedWorkouts, exerciseById, sets, workoutExercises],
  )
  const filteredWorkouts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return completedWorkouts.filter((workout) => {
      const dateKey = workoutDateKey(workout)
      if (fromDate && dateKey < fromDate) return false
      if (toDate && dateKey > toDate) return false
      if (!normalizedQuery) return true
      const exerciseNames = (detailsByWorkoutId.get(workout.id) ?? []).map((detail) => detail.exercise?.name ?? '')
      return [workout.name, ...exerciseNames].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    })
  }, [completedWorkouts, detailsByWorkoutId, fromDate, query, toDate])
  const visibleWorkouts = filteredWorkouts.slice(0, visibleCount)
  const groupedWorkouts = groupWorkoutsByMonth(visibleWorkouts)
  const calendarCells = buildMonthCells(visibleMonth, filteredWorkouts)
  const selectedDateWorkouts = selectedDate ? filteredWorkouts.filter((workout) => workoutDateKey(workout) === selectedDate) : []
  const selectedDetails = selectedWorkout ? detailsByWorkoutId.get(selectedWorkout.id) ?? [] : []

  useEffect(() => setVisibleCount(PAGE_SIZE), [fromDate, query, toDate])
  useEffect(() => {
    if (!initialWorkoutId) return
    setSelectedWorkout(completedWorkouts.find((workout) => workout.id === initialWorkoutId) ?? null)
  }, [completedWorkouts, initialWorkoutId])
  useEffect(() => {
    if (!selectedWorkout) return
    const latest = completedWorkouts.find((workout) => workout.id === selectedWorkout.id)
    if (latest && latest !== selectedWorkout) setSelectedWorkout(latest)
  }, [completedWorkouts, selectedWorkout])

  async function repeatSelectedWorkout() {
    if (!selectedWorkout || isRepeating) return
    setIsRepeating(true)
    const started = await onRepeat(selectedWorkout)
    if (!started) setIsRepeating(false)
  }

  return (
    <div className="space-y-6">
      <MobileHeader
        leftAction={<BackButton onClick={onBack} />}
        title={<h1 className="text-3xl font-bold tracking-tight">Workout History</h1>}
        subtitle="Every completed training session."
      />
      {banners}
      {loadError && !isLoading ? (
        <ErrorState icon={AlertTriangle} title="Unable to load workout history" description={loadError} action={<SecondaryButton onClick={onRetry}>Retry</SecondaryButton>} />
      ) : (
        <>
          <SurfaceCard className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-button bg-surface-input p-1" aria-label="History view">
              <ViewButton active={view === 'list'} onClick={() => setView('list')}><List className="h-4 w-4" aria-hidden="true" />List</ViewButton>
              <ViewButton active={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays className="h-4 w-4" aria-hidden="true" />Calendar</ViewButton>
            </div>
            <label className="relative block">
              <span className="sr-only">Search workouts by exercise</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <Input className="pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercise or workout" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <DateField label="From" value={fromDate} onChange={setFromDate} />
              <DateField label="To" value={toDate} onChange={setToDate} />
            </div>
            <div className="flex gap-2">
              <Input type="date" value={backdatedDate} onChange={(event) => setBackdatedDate(event.target.value)} aria-label="Missed workout date" />
              <SecondaryButton disabled={!backdatedDate} onClick={() => void onCreateBackdated(backdatedDate)}>Log missed</SecondaryButton>
            </div>
          </SurfaceCard>

          {view === 'calendar' ? (
            <CalendarView
              month={visibleMonth}
              cells={calendarCells}
              selectedDate={selectedDate}
              onChangeMonth={(offset) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))}
              onSelectDate={setSelectedDate}
            />
          ) : (
            <WorkoutList
              groups={groupedWorkouts}
              detailsByWorkoutId={detailsByWorkoutId}
              totalCount={filteredWorkouts.length}
              visibleCount={visibleCount}
              isLoading={isLoading}
              onSelect={setSelectedWorkout}
              onLoadMore={() => setVisibleCount((current) => current + PAGE_SIZE)}
            />
          )}

          {view === 'calendar' && selectedDate ? (
            <SurfaceCard className="p-0">
              <div className="border-b border-white/10 p-4">
                <h2 className="text-lg font-semibold">{formatDateKey(selectedDate)}</h2>
                <p className="mt-1 text-sm text-text-secondary">{selectedDateWorkouts.length} completed workout{selectedDateWorkouts.length === 1 ? '' : 's'}</p>
              </div>
              <div className="divide-y divide-white/10 px-4">
                {selectedDateWorkouts.length ? selectedDateWorkouts.map((workout) => (
                  <WorkoutSummaryRow key={workout.id} workout={workout} details={detailsByWorkoutId.get(workout.id) ?? []} onSelect={setSelectedWorkout} />
                )) : <p className="py-5 text-sm text-text-secondary">No workouts match this date and the current filters.</p>}
              </div>
            </SurfaceCard>
          ) : null}
        </>
      )}

      <BottomSheet
        open={Boolean(selectedWorkout)}
        onClose={() => !isRepeating && setSelectedWorkout(null)}
        title={selectedWorkout?.name || 'Workout'}
        description={selectedWorkout ? formatWorkoutDate(selectedWorkout) : undefined}
        className="h-[min(86dvh,780px)]"
        position="top"
      >
        {selectedWorkout ? <HistoryWorkoutEditor workout={selectedWorkout} onSave={(patch) => onUpdateWorkout(selectedWorkout, patch)} /> : null}
        <WorkoutDetails workout={selectedWorkout} details={selectedDetails} onRepeat={() => void repeatSelectedWorkout()} isRepeating={isRepeating} onUpdateSet={onUpdateSet} />
      </BottomSheet>
    </div>
  )
}

function HistoryWorkoutEditor({ workout, onSave }: { workout: Workout; onSave: (patch: Partial<Workout>) => void }) {
  const [name, setName] = useState(workout.name)
  const [notes, setNotes] = useState(workout.notes ?? '')
  const [date, setDate] = useState(workoutDateKey(workout))
  const [duration, setDuration] = useState(String(Math.round((workout.duration_seconds ?? 0) / 60) || ''))
  return (
    <SurfaceCard className="mb-4 space-y-3">
      <Input value={name} onChange={(event) => setName(event.target.value)} aria-label="Workout name" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Workout date" />
        <Input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Minutes" aria-label="Workout duration minutes" />
      </div>
      <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Workout notes" aria-label="Workout notes" />
      <SecondaryButton className="w-full" onClick={() => {
        const original = new Date(workout.started_at)
        const [year, month, day] = date.split('-').map(Number)
        const nextStart = new Date(original)
        nextStart.setFullYear(year, month - 1, day)
        const durationSeconds = duration && Number.isFinite(Number(duration)) ? Math.max(0, Number(duration) * 60) : (workout.duration_seconds ?? 0)
        onSave({ name: name.trim() || 'Workout', notes: notes.trim() || null, started_at: nextStart.toISOString(), completed_at: new Date(nextStart.getTime() + durationSeconds * 1000).toISOString(), duration_seconds: durationSeconds })
      }}>Save corrections</SecondaryButton>
    </SurfaceCard>
  )
}

function WorkoutList({ groups, detailsByWorkoutId, totalCount, visibleCount, isLoading, onSelect, onLoadMore }: {
  groups: Array<{ label: string; workouts: Workout[] }>
  detailsByWorkoutId: Map<string, ReturnType<typeof getWorkoutDetails>>
  totalCount: number
  visibleCount: number
  isLoading: boolean
  onSelect: (workout: Workout) => void
  onLoadMore: () => void
}) {
  if (isLoading && !groups.length) return <SurfaceCard><p className="text-sm text-text-secondary">Loading workout history…</p></SurfaceCard>
  if (!groups.length) return <EmptyState icon={CalendarX2} title="No workouts found" description="Complete a workout or adjust the current filters." />

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <SurfaceCard key={group.label} className="p-0">
          <h2 className="border-b border-white/10 p-4 text-lg font-semibold">{group.label}</h2>
          <div className="divide-y divide-white/10 px-4">
            {group.workouts.map((workout) => <WorkoutSummaryRow key={workout.id} workout={workout} details={detailsByWorkoutId.get(workout.id) ?? []} onSelect={onSelect} />)}
          </div>
        </SurfaceCard>
      ))}
      {visibleCount < totalCount ? <SecondaryButton className="w-full" onClick={onLoadMore}>Load more</SecondaryButton> : null}
    </div>
  )
}

function CalendarView({ month, cells, selectedDate, onChangeMonth, onSelectDate }: {
  month: Date
  cells: CalendarCell[]
  selectedDate: string
  onChangeMonth: (offset: number) => void
  onSelectDate: (date: string) => void
}) {
  return (
    <SurfaceCard className="space-y-4 p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="touch-target flex h-11 w-11 cursor-pointer items-center justify-center rounded-full active:bg-surface-elevated" onClick={() => onChangeMonth(-1)} aria-label="Previous month"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <h2 className="text-lg font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="touch-target flex h-11 w-11 cursor-pointer items-center justify-center rounded-full active:bg-surface-elevated" onClick={() => onChangeMonth(1)} aria-label="Next month"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-text-muted">{WEEKDAY_LABELS.map((label, index) => <span key={`${label}-${index}`} className="py-1">{label}</span>)}</div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => cell.inMonth ? (
          <button
            key={cell.key}
            type="button"
            className={cn(
              'relative flex aspect-square min-h-11 cursor-pointer items-center justify-center rounded-button text-sm tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
              selectedDate === cell.key ? 'bg-accent-blue font-semibold text-white' : cell.count ? 'bg-emerald-700/70 text-white active:bg-emerald-600' : 'bg-surface-input text-text-secondary active:bg-surface-elevated',
            )}
            onClick={() => onSelectDate(cell.key)}
            aria-label={`${cell.label}: ${cell.count} workout${cell.count === 1 ? '' : 's'}`}
          >
            {cell.day}
            {cell.count > 0 ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white" aria-hidden="true" /> : null}
          </button>
        ) : <span key={cell.key} aria-hidden="true" />)}
      </div>
    </SurfaceCard>
  )
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={cn('touch-target flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold transition', active ? 'bg-surface-card text-white shadow-card' : 'text-text-secondary active:bg-surface-elevated')} aria-pressed={active} onClick={onClick}>{children}</button>
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium text-text-secondary">{label}<Input className="mt-1 px-2 text-sm" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

type CalendarCell = { key: string; day: number; count: number; label: string; inMonth: boolean }

function buildMonthCells(month: Date, workouts: Workout[]): CalendarCell[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const countByDate = new Map<string, number>()
  for (const workout of workouts) countByDate.set(workoutDateKey(workout), (countByDate.get(workoutDateKey(workout)) ?? 0) + 1)
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay.getDay() + 1
    const date = new Date(month.getFullYear(), month.getMonth(), Math.max(day, 1))
    const key = localDateKey(date)
    return { key: `${key}-${index}`, day, count: day >= 1 && day <= daysInMonth ? countByDate.get(key) ?? 0 : 0, label: date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), inMonth: day >= 1 && day <= daysInMonth }
  }).map((cell) => cell.inMonth ? { ...cell, key: cell.key.replace(/-\d+$/, '') } : cell)
}

function groupWorkoutsByMonth(workouts: Workout[]) {
  const groups = new Map<string, Workout[]>()
  for (const workout of workouts) {
    const label = new Date(workout.completed_at ?? workout.started_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    groups.set(label, [...(groups.get(label) ?? []), workout])
  }
  return [...groups].map(([label, grouped]) => ({ label, workouts: grouped }))
}

function parseDateKey(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateKey(value: string) {
  return parseDateKey(value)?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? value
}
