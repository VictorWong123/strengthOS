import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { expandSearch, normalizeSearch } from '../lib/search'
import type { Exercise } from '../lib/types'
import { Badge, Card, Input } from './ui'

type Props = {
  exercises: Exercise[]
  onSelect: (exercise: Exercise) => void
  onOpenDetails: (exercise: Exercise) => void
}

export function ExercisePicker({ exercises, onSelect, onOpenDetails }: Props) {
  const [query, setQuery] = useState('')
  const terms = expandSearch(query)

  const filtered = useMemo(() => {
    if (!query.trim()) return exercises.slice(0, 30)
    return exercises
      .filter((exercise) => {
        const haystack = normalizeSearch(
          [exercise.name, exercise.primary_muscle, exercise.body_part, exercise.equipment].filter(Boolean).join(' '),
        )
        return terms.some((term) => haystack.includes(term))
      })
      .slice(0, 50)
  }, [exercises, query, terms])

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Exercise picker</h2>
        <p className="text-sm text-gray-400">Search by name, muscle, equipment, or body part.</p>
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-500" aria-hidden="true" />
        <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bench, DB bench, Smith bench, RDL" />
      </label>
      <div className="grid gap-3">
        {filtered.map((exercise) => (
          <article key={exercise.id} className="rounded-lg border border-white/10 bg-surface-input p-3">
            <div className="flex gap-3">
              <Thumbnail exercise={exercise} onOpenDetails={onOpenDetails} />
              <div className="min-w-0 flex-1">
                <button className="text-left font-medium text-white" onClick={() => onOpenDetails(exercise)}>
                  {exercise.name}
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className="bg-blue-500/15 text-blue-200">{exercise.equipment ?? 'No equipment'}</Badge>
                  {exercise.primary_muscle ? <Badge>{exercise.primary_muscle}</Badge> : null}
                  {exercise.body_part ? <Badge>{exercise.body_part}</Badge> : null}
                </div>
              </div>
              <button
                className="touch-target rounded-lg bg-accent-blue px-3 text-sm font-semibold"
                onClick={() => onSelect(exercise)}
              >
                Add
              </button>
            </div>
          </article>
        ))}
      </div>
    </Card>
  )
}

function Thumbnail({
  exercise,
  onOpenDetails,
}: {
  exercise: Exercise
  onOpenDetails: (exercise: Exercise) => void
}) {
  const [failed, setFailed] = useState(false)
  const showImage = exercise.thumbnail_url && !failed

  return (
    <button
      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-elevated text-xs text-gray-500"
      onClick={() => onOpenDetails(exercise)}
    >
      {showImage ? (
        <img
          src={exercise.thumbnail_url ?? ''}
          alt={`${exercise.name} thumbnail`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        'No media'
      )}
    </button>
  )
}
