import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Ellipsis,
  GripVertical,
  Pencil,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
} from 'lucide-react'
import type { ElementType, ReactNode } from 'react'
import type { Exercise, Routine, RoutineExercise } from '../lib/types'
import {
  EmptyState,
  Field,
  FixedBottomActions,
  IconButton,
  Input,
  LoadingSkeleton,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
  Textarea,
  cn,
} from './ui'

type RoutineCardProps = {
  routine: Routine
  summary: string
  disabled?: boolean
  onOpen: () => void
  onStart: () => void
  onOpenMenu: () => void
}

type RoutineGroupProps = {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

type QuickActionProps = {
  icon: ElementType
  title: string
  description: string
  onClick: () => void
}

type RoutineEditorExercise = RoutineExercise & {
  exercise: Exercise | null
  minReps: string
  maxReps: string
  targetRpe: string
}

type RoutineEditorProps = {
  title: string
  name: string
  notes: string
  exercises: RoutineEditorExercise[]
  validationError: string
  isSaving: boolean
  onNameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onAddExercise: () => void
  onSave: () => void
  onCancel: () => void
  onRemoveExercise: (id: string) => void
  onMoveExercise: (id: string, direction: -1 | 1) => void
  onExerciseFieldChange: (id: string, patch: Partial<Pick<RoutineEditorExercise, 'target_sets' | 'minReps' | 'maxReps' | 'targetRpe'>>) => void
}

export function RoutineSectionHeader({ title, onCreate }: { title: string; onCreate: () => void }) {
  return (
    <SectionHeader
      title={title}
      action={
        <IconButton aria-label="Create routine" onClick={onCreate}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      }
    />
  )
}

export function RoutineQuickAction({ icon: Icon, title, description, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] w-full flex-col items-start justify-center rounded-card border border-white/10 bg-surface-card px-4 py-4 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <Icon className="mb-2 h-5 w-5 text-accent-blue" aria-hidden="true" />
      <span className="text-base font-semibold">{title}</span>
      <span className="mt-1 text-sm text-text-secondary">{description}</span>
    </button>
  )
}

export function RoutineGroup({ title, count, expanded, onToggle, children }: RoutineGroupProps) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-text-secondary">{count} saved routines</p>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-text-secondary" aria-hidden="true" /> : <ChevronDown className="h-5 w-5 text-text-secondary" aria-hidden="true" />}
      </button>
      {expanded ? children : null}
    </div>
  )
}

export function RoutineCard({ routine, summary, disabled = false, onOpen, onStart, onOpenMenu }: RoutineCardProps) {
  return (
    <SurfaceCard className={cn('space-y-4 p-4', disabled && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h4 className="truncate text-xl font-semibold">{routine.name}</h4>
          <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{summary}</p>
        </button>
        <IconButton aria-label={`Open ${routine.name} options`} onClick={onOpenMenu}>
          <Ellipsis className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      </div>
      <PrimaryButton className="w-full" disabled={disabled} onClick={onStart}>
        <Play className="h-4 w-4" aria-hidden="true" />
        Start Routine
      </PrimaryButton>
    </SurfaceCard>
  )
}

export function RoutineCardSkeleton() {
  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <LoadingSkeleton className="h-6 w-40" />
          <LoadingSkeleton className="h-4 w-full" />
          <LoadingSkeleton className="h-4 w-2/3" />
        </div>
        <LoadingSkeleton className="h-11 w-11 rounded-full" />
      </div>
      <LoadingSkeleton className="h-[52px] w-full rounded-button" />
    </SurfaceCard>
  )
}

export function RoutineEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No routines yet"
      description="Create a routine to start your workouts faster."
      action={<PrimaryButton onClick={onCreate}>Create Routine</PrimaryButton>}
    />
  )
}

export function RoutineActionList({
  canMoveUp,
  canMoveDown,
  onEdit,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-2">
      <ActionButton icon={Pencil} label="Edit" onClick={onEdit} />
      <ActionButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
      <ActionButton icon={ArrowUp} label="Move Up" onClick={onMoveUp} disabled={!canMoveUp} />
      <ActionButton icon={ArrowDown} label="Move Down" onClick={onMoveDown} disabled={!canMoveDown} />
      <ActionButton icon={Trash2} label="Delete" onClick={onDelete} tone="danger" />
    </div>
  )
}

export function RoutineEditor({
  title,
  name,
  notes,
  exercises,
  validationError,
  isSaving,
  onNameChange,
  onNotesChange,
  onAddExercise,
  onSave,
  onCancel,
  onRemoveExercise,
  onMoveExercise,
  onExerciseFieldChange,
}: RoutineEditorProps) {
  return (
    <div className="space-y-5 pb-36">
      <SectionHeader
        title={title}
        subtitle="Routine name and at least one exercise are required."
        action={<PrimaryButton disabled={isSaving} onClick={onSave}>{isSaving ? 'Saving...' : 'Save'}</PrimaryButton>}
      />
      <SurfaceCard className="space-y-4">
        <Field label="Routine name">
          <Input
            placeholder="Push Day"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </Field>
        <Field label="Notes">
          <Textarea
            placeholder="Optional notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </Field>
      </SurfaceCard>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">Exercises</h3>
          <SecondaryButton className="px-3" onClick={onAddExercise}>
            Add Exercise
          </SecondaryButton>
        </div>
        {validationError ? <p className="text-sm text-accent-danger">{validationError}</p> : null}
        {exercises.length ? (
          exercises.map((item, index) => (
            <SurfaceCard key={item.id} className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex items-center gap-2 text-text-secondary">
                  <GripVertical className="h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-medium">{index + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-lg font-semibold">{item.exercise?.name ?? 'Unknown exercise'}</h4>
                  <p className="mt-1 text-sm text-text-secondary">{item.exercise?.equipment ?? 'No equipment'}</p>
                </div>
                <div className="flex gap-2">
                  <IconButton aria-label={`Move ${item.exercise?.name ?? 'exercise'} up`} onClick={() => onMoveExercise(item.id, -1)} disabled={index === 0}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton aria-label={`Move ${item.exercise?.name ?? 'exercise'} down`} onClick={() => onMoveExercise(item.id, 1)} disabled={index === exercises.length - 1}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                  label="Sets"
                  value={item.target_sets === null ? '' : String(item.target_sets)}
                  onChange={(value) =>
                    onExerciseFieldChange(item.id, { target_sets: value ? Number(value) : null })
                  }
                />
                <NumberField
                  label="Min reps"
                  value={item.minReps}
                  onChange={(value) => onExerciseFieldChange(item.id, { minReps: value })}
                />
                <NumberField
                  label="Max reps"
                  value={item.maxReps}
                  onChange={(value) => onExerciseFieldChange(item.id, { maxReps: value })}
                />
                <NumberField
                  label="RPE"
                  value={item.targetRpe}
                  onChange={(value) => onExerciseFieldChange(item.id, { targetRpe: value })}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveExercise(item.id)}
                className="inline-flex items-center gap-2 text-sm font-medium text-accent-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove exercise
              </button>
            </SurfaceCard>
          ))
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No exercises yet"
            description="Add at least one exercise before saving this routine."
            action={<PrimaryButton onClick={onAddExercise}>Add Exercise</PrimaryButton>}
          />
        )}
      </div>

      <FixedBottomActions>
        <SecondaryButton className="flex-1" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <PrimaryButton className="flex-1" disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving...' : 'Save Routine'}
        </PrimaryButton>
      </FixedBottomActions>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  tone = 'default',
}: {
  icon: ElementType
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      className={cn(
        'touch-target flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-surface-input px-4 py-3 text-left text-base font-medium text-text-primary transition active:bg-surface-elevated disabled:pointer-events-none disabled:opacity-40',
        tone === 'danger' && 'text-accent-danger',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}
