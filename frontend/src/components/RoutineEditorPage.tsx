import { ClipboardPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Exercise, RoutineExercise } from '../lib/types'
import { RoutineEditor } from './RoutineUI'
import { EmptyState, MobileHeader } from './ui'

type RoutineEditorExercise = RoutineExercise & {
  exercise: Exercise | null
  minReps: string
  maxReps: string
  targetRpe: string
}

type RoutineEditorDraft = {
  title: string
  name: string
  notes: string
  exercises: RoutineEditorExercise[]
}

type RoutineEditorPageProps = {
  mode: 'new' | 'edit'
  banners: ReactNode
  draft: RoutineEditorDraft | null
  validationError: string
  isSaving: boolean
  onBack: () => void
  onNameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onAddExercise: () => void
  onSave: () => void
  onCancel: () => void
  onRemoveExercise: (id: string) => void
  onMoveExercise: (id: string, direction: -1 | 1) => void
  onExerciseFieldChange: (id: string, patch: Partial<Pick<RoutineEditorExercise, 'target_sets' | 'minReps' | 'maxReps' | 'targetRpe' | 'rest_seconds' | 'timer_enabled'>>) => void
}

export function RoutineEditorPage({
  mode,
  banners,
  draft,
  validationError,
  isSaving,
  onBack,
  onNameChange,
  onNotesChange,
  onAddExercise,
  onSave,
  onCancel,
  onRemoveExercise,
  onMoveExercise,
  onExerciseFieldChange,
}: RoutineEditorPageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">{mode === 'new' ? 'New Routine' : 'Edit Routine'}</h1>}
        leftAction={
          <button type="button" onClick={onBack} className="text-sm font-medium text-text-secondary">
            Back
          </button>
        }
      />
      {banners}
      {draft ? (
        <RoutineEditor
          title={draft.title}
          name={draft.name}
          notes={draft.notes}
          exercises={draft.exercises}
          validationError={validationError}
          isSaving={isSaving}
          onNameChange={onNameChange}
          onNotesChange={onNotesChange}
          onAddExercise={onAddExercise}
          onSave={onSave}
          onCancel={onCancel}
          onRemoveExercise={onRemoveExercise}
          onMoveExercise={onMoveExercise}
          onExerciseFieldChange={onExerciseFieldChange}
        />
      ) : (
        <EmptyState
          icon={ClipboardPlus}
          title="Preparing routine editor"
          description="Routine data will appear once loading finishes."
        />
      )}
    </div>
  )
}
