import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createSearchIndex, exerciseSearchScore, type SearchIndex } from '../lib/search'
import type { Exercise } from '../lib/types'
import { ExerciseSummary } from './ExerciseSummary'
import { EmptyState, IconButton, Input, SurfaceCard, cn } from './ui'

type Props = {
  exercises: Exercise[]
  isLoading?: boolean
  actionLabel?: string
  stickyTopClassName?: string
  onSelect: (exercise: Exercise) => void
  onOpenDetails: (exercise: Exercise) => void
}

type SearchableExercise = {
  exercise: Exercise
  searchIndex: SearchIndex
}

type FilterKey = 'primary_muscle' | 'equipment'

export function ExercisePicker({
  exercises,
  isLoading = false,
  actionLabel = 'Add',
  stickyTopClassName = 'top-0',
  onSelect,
  onOpenDetails,
}: Props) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ primary_muscle: '', equipment: '' })
  const searchableExercises = useMemo<SearchableExercise[]>(
    () =>
      exercises.map((exercise) => ({
        exercise,
        searchIndex: createSearchIndex(
          [
            exercise.name,
            exercise.normalized_name,
            exercise.primary_muscle,
            exercise.body_part,
            exercise.equipment,
            exercise.movement_category,
            ...exercise.secondary_muscles,
          ]
            .filter(Boolean)
            .join(' '),
        ),
      })),
    [exercises],
  )

  const options = useMemo(
    () => ({
      primary_muscle: uniqueOptions(exercises.map((exercise) => exercise.primary_muscle)),
      equipment: uniqueOptions(exercises.map((exercise) => exercise.equipment)),
    }),
    [exercises],
  )

  const filtered = useMemo(() => {
    const source = query.trim()
      ? searchableExercises
          .map(({ exercise, searchIndex }) => ({
            exercise,
            score: exerciseSearchScore(query, searchIndex),
          }))
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score || left.exercise.name.localeCompare(right.exercise.name))
          .map(({ exercise }) => exercise)
      : exercises
    return source
      .filter((exercise) => !filters.primary_muscle || exercise.primary_muscle === filters.primary_muscle)
      .filter((exercise) => !filters.equipment || exercise.equipment === filters.equipment)
      .slice(0, 80)
  }, [exercises, filters, query, searchableExercises])

  return (
    <section className="space-y-4">
      <div className={cn('sticky z-20 -mx-4 bg-black/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6', stickyTopClassName)}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" />
        </label>
        <div className="scrollbar-hidden mt-3 flex gap-2 overflow-x-auto">
          <FilterSelect label="Muscle" value={filters.primary_muscle} options={options.primary_muscle} onChange={(value) => setFilters((current) => ({ ...current, primary_muscle: value }))} />
          <FilterSelect label="Equipment" value={filters.equipment} options={options.equipment} onChange={(value) => setFilters((current) => ({ ...current, equipment: value }))} />
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-3">
          <SurfaceCard className="h-[96px] animate-pulse" />
          <SurfaceCard className="h-[96px] animate-pulse" />
          <SurfaceCard className="h-[96px] animate-pulse" />
        </div>
      ) : !exercises.length ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title="Exercise catalog is empty"
          description="Sync ExerciseDB before searching or adding exercises."
        />
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
      <ExerciseSummary
        exercise={exercise}
        showThumbnail={false}
        onOpenDetails={onOpenDetails}
        action={
          <IconButton aria-label={`${actionLabel} ${exercise.name}`} onClick={() => onSelect(exercise)}>
            <Plus className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
      />
    </SurfaceCard>
  )
}

function uniqueOptions(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
}
