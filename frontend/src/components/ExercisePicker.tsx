import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { expandSearch, normalizeSearch } from '../lib/search'
import type { Exercise } from '../lib/types'
import { Badge, EmptyState, IconButton, Input, SurfaceCard, cn } from './ui'

type Props = {
  exercises: Exercise[]
  isLoading?: boolean
  actionLabel?: string
  onSelect: (exercise: Exercise) => void
  onOpenDetails: (exercise: Exercise) => void
}

type SearchableExercise = {
  exercise: Exercise
  searchText: string
}

type FilterKey = 'primary_muscle' | 'equipment' | 'body_part'

export function ExercisePicker({ exercises, isLoading = false, actionLabel = 'Add', onSelect, onOpenDetails }: Props) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ primary_muscle: '', equipment: '', body_part: '' })
  const terms = useMemo(() => expandSearch(query), [query])
  const searchableExercises = useMemo<SearchableExercise[]>(
    () =>
      exercises.map((exercise) => ({
        exercise,
        searchText: normalizeSearch([exercise.name, exercise.primary_muscle, exercise.body_part, exercise.equipment].filter(Boolean).join(' ')),
      })),
    [exercises],
  )

  const options = useMemo(
    () => ({
      primary_muscle: uniqueOptions(exercises.map((exercise) => exercise.primary_muscle)),
      equipment: uniqueOptions(exercises.map((exercise) => exercise.equipment)),
      body_part: uniqueOptions(exercises.map((exercise) => exercise.body_part)),
    }),
    [exercises],
  )

  const filtered = useMemo(() => {
    const source = query.trim()
      ? searchableExercises.filter(({ searchText }) => terms.some((term) => searchText.includes(term))).map(({ exercise }) => exercise)
      : exercises
    return source
      .filter((exercise) => !filters.primary_muscle || exercise.primary_muscle === filters.primary_muscle)
      .filter((exercise) => !filters.equipment || exercise.equipment === filters.equipment)
      .filter((exercise) => !filters.body_part || exercise.body_part === filters.body_part)
      .slice(0, 80)
  }, [exercises, filters, query, searchableExercises, terms])

  return (
    <section className="space-y-4">
      <div className="sticky top-[calc(80px+env(safe-area-inset-top))] z-20 -mx-4 bg-black/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" />
        </label>
        <div className="scrollbar-hidden mt-3 flex gap-2 overflow-x-auto">
          <FilterSelect label="Muscle" value={filters.primary_muscle} options={options.primary_muscle} onChange={(value) => setFilters((current) => ({ ...current, primary_muscle: value }))} />
          <FilterSelect label="Equipment" value={filters.equipment} options={options.equipment} onChange={(value) => setFilters((current) => ({ ...current, equipment: value }))} />
          <FilterSelect label="Body Part" value={filters.body_part} options={options.body_part} onChange={(value) => setFilters((current) => ({ ...current, body_part: value }))} />
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-3">
          <SurfaceCard className="h-[96px] animate-pulse" />
          <SurfaceCard className="h-[96px] animate-pulse" />
          <SurfaceCard className="h-[96px] animate-pulse" />
        </div>
      ) : filtered.length ? (
        <div className="grid gap-3">
          {filtered.map((exercise) => (
            <ExerciseListItem key={exercise.id} exercise={exercise} actionLabel={actionLabel} onSelect={onSelect} onOpenDetails={onOpenDetails} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title="No exercises found"
          description="Try a different search or clear a filter."
        />
      )}
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <select
      className={cn('min-h-11 shrink-0 rounded-full border border-app-border bg-surface-card px-3 text-sm text-white')}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

function ExerciseListItem({
  exercise,
  actionLabel,
  onSelect,
  onOpenDetails,
}: {
  exercise: Exercise
  actionLabel: string
  onSelect: (exercise: Exercise) => void
  onOpenDetails: (exercise: Exercise) => void
}) {
  return (
    <SurfaceCard className="p-3">
      <div className="flex min-h-[72px] items-center gap-3">
        <Thumbnail exercise={exercise} onOpenDetails={onOpenDetails} />
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpenDetails(exercise)}>
          <span className="block truncate font-semibold text-white">{exercise.name}</span>
          <span className="mt-1 flex flex-wrap gap-2">
            {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
            <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
          </span>
        </button>
        <IconButton aria-label={`${actionLabel} ${exercise.name}`} onClick={() => onSelect(exercise)}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </div>
    </SurfaceCard>
  )
}

function Thumbnail({ exercise, onOpenDetails }: { exercise: Exercise; onOpenDetails: (exercise: Exercise) => void }) {
  const [failed, setFailed] = useState(false)
  const showImage = exercise.thumbnail_url && !failed

  return (
    <button className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-elevated text-[10px] text-zinc-500" onClick={() => onOpenDetails(exercise)}>
      {showImage ? (
        <img
          src={exercise.thumbnail_url ?? ''}
          alt={`${exercise.name} thumbnail`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        'No media'
      )}
    </button>
  )
}

function uniqueOptions(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)).slice(0, 40)
}
