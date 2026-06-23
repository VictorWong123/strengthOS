import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Exercise } from '../lib/types'
import { ExercisePicker } from './ExercisePicker'
import { ErrorState, MobileHeader, SecondaryButton } from './ui'

type ExercisesPageProps = {
  banners: ReactNode
  exercises: Exercise[]
  isLoading: boolean
  loadError: string | null
  onBack: () => void
  onRetry: () => void
  onSelect: (exercise: Exercise) => void
  onOpenDetails: (exercise: Exercise) => void
}

export function ExercisesPage({
  banners,
  exercises,
  isLoading,
  loadError,
  onBack,
  onRetry,
  onSelect,
  onOpenDetails,
}: ExercisesPageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">Exercises</h1>}
        leftAction={
          <button type="button" onClick={onBack} className="text-sm font-medium text-text-secondary">
            Back
          </button>
        }
      />
      {banners}
      {loadError && !isLoading ? (
        <ErrorState
          icon={AlertTriangle}
          title="Unable to load exercises"
          description={loadError}
          action={<SecondaryButton onClick={onRetry}>Retry</SecondaryButton>}
        />
      ) : (
        <ExercisePicker
          exercises={exercises}
          isLoading={isLoading}
          actionLabel="Add"
          stickyTopClassName="top-[calc(96px+env(safe-area-inset-top))]"
          onSelect={onSelect}
          onOpenDetails={onOpenDetails}
        />
      )}
    </div>
  )
}
