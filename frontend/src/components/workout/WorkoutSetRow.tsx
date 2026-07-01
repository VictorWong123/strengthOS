import { memo, useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { WorkoutSet } from '../../lib/types'
import { DeleteTextButton, cn } from '../ui'
import { formatPreviousSet, formatValue } from './workoutSummary'

type WorkoutSetRowProps = {
  set: WorkoutSet
  previousSet: WorkoutSet | null
  onUpdateSet: (set: WorkoutSet, patch: Partial<WorkoutSet>) => void
  onDeleteSet: (set: WorkoutSet) => void
  onCompleteSet: () => void
}

export const WorkoutSetRow = memo(function WorkoutSetRow({
  set,
  previousSet,
  onUpdateSet,
  onDeleteSet,
  onCompleteSet,
}: WorkoutSetRowProps) {
  const [weightDraft, setWeightDraft] = useState(formatValue(set.weight))
  const [repsDraft, setRepsDraft] = useState(formatValue(set.reps))

  useEffect(() => setWeightDraft(formatValue(set.weight)), [set.weight])
  useEffect(() => setRepsDraft(formatValue(set.reps)), [set.reps])

  function commitNumber(field: 'weight' | 'reps', draft: string) {
    const currentValue = field === 'weight' ? set.weight : set.reps
    const currentDraft = formatValue(currentValue)
    const trimmed = draft.trim()

    if (trimmed === currentDraft) return
    if (!trimmed) {
      onUpdateSet(set, { [field]: null })
      return
    }

    const nextValue = Number(trimmed)
    if (!Number.isFinite(nextValue)) {
      if (field === 'weight') setWeightDraft(currentDraft)
      else setRepsDraft(currentDraft)
      return
    }

    onUpdateSet(set, { [field]: nextValue })
  }

  function toggleCompleted() {
    const isCompleting = !set.is_completed
    onUpdateSet(set, {
      is_completed: isCompleting,
      completed_at: isCompleting ? new Date().toISOString() : null,
    })
    if (isCompleting) onCompleteSet()
  }

  return (
    <div className={cn('grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 rounded-2xl p-2', set.is_completed ? 'bg-surface-success ring-1 ring-accent-done/25' : 'bg-surface-input')}>
      <div className="flex items-center justify-center text-sm text-text-secondary">{set.set_order + 1}</div>
      <button
        type="button"
        className="min-w-0 rounded-xl bg-surface-card px-2 text-left text-xs text-text-secondary"
        onClick={() => {
          if (!previousSet) return
          if (previousSet.weight !== null) {
            setWeightDraft(formatValue(previousSet.weight))
            onUpdateSet(set, { weight: previousSet.weight })
          }
          if (previousSet.reps !== null) {
            setRepsDraft(formatValue(previousSet.reps))
            onUpdateSet(set, { reps: previousSet.reps })
          }
        }}
      >
        {previousSet ? formatPreviousSet(previousSet) : '--'}
      </button>
      <input
        inputMode="decimal"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={weightDraft}
        placeholder="0"
        onChange={(event) => setWeightDraft(event.target.value)}
        onBlur={() => commitNumber('weight', weightDraft)}
      />
      <input
        inputMode="numeric"
        className="w-full rounded-xl border border-white/10 bg-surface-card px-2 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25"
        value={repsDraft}
        placeholder="0"
        onChange={(event) => setRepsDraft(event.target.value)}
        onBlur={() => commitNumber('reps', repsDraft)}
      />
      <button
        type="button"
        className={cn(
          'touch-target rounded-xl bg-surface-card transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
          set.is_completed ? 'text-accent-done' : 'text-text-muted',
        )}
        onClick={toggleCompleted}
        aria-label={set.is_completed ? 'Mark set incomplete' : 'Mark set complete'}
        aria-pressed={set.is_completed}
      >
        <CheckCircle2 className={cn('mx-auto h-5 w-5', !set.is_completed && 'opacity-45')} aria-hidden="true" />
      </button>
      <DeleteTextButton className="touch-target col-span-full justify-end text-text-secondary" label="Delete set" onClick={() => onDeleteSet(set)} />
    </div>
  )
})
