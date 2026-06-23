import { AlertTriangle, ChevronDown, ClipboardPlus, FolderPlus, ListRestart, RefreshCw, Search, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Routine } from '../lib/types'
import { RoutineCard, RoutineCardSkeleton, RoutineEmptyState, RoutineGroup, RoutineQuickAction } from './RoutineUI'
import { DismissibleBanner, ErrorState, IconButton, MobileHeader, SecondaryButton, SectionHeader } from './ui'

type WorkoutPageProps = {
  banners: ReactNode
  routines: Routine[]
  routineGroupExpanded: boolean
  showReorderHint: boolean
  isLoading: boolean
  loadError: string | null
  routineSummary: (routineId: string) => string
  onToggleRoutineGroup: () => void
  onDismissReorderHint: () => void
  onRetry: () => void
  onNavigate: (pathname: string) => void
  onStartEmptyWorkout: () => void
  onOpenRoutine: (routineId: string) => void
  onOpenRoutineMenu: (routineId: string) => void
  onStartRoutine: (routine: Routine) => void
}

export function WorkoutPage({
  banners,
  routines,
  routineGroupExpanded,
  showReorderHint,
  isLoading,
  loadError,
  routineSummary,
  onToggleRoutineGroup,
  onDismissReorderHint,
  onRetry,
  onNavigate,
  onStartEmptyWorkout,
  onOpenRoutine,
  onOpenRoutineMenu,
  onStartRoutine,
}: WorkoutPageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={
          <button type="button" className="flex items-center gap-2 text-left">
            <h1 className="text-4xl font-bold tracking-tight">Workout</h1>
            <ChevronDown className="mt-1 h-5 w-5 text-text-secondary" aria-hidden="true" />
          </button>
        }
        rightAction={
          <IconButton aria-label="Workout settings" onClick={() => onNavigate('/profile')}>
            <Settings2 className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
      />
      {banners}
      <button
        type="button"
        onClick={onStartEmptyWorkout}
        className="flex min-h-[64px] w-full items-center justify-start gap-3 rounded-card border border-white/10 bg-surface-card px-4 py-4 text-left text-lg font-semibold transition active:bg-surface-elevated"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-input">
          <ClipboardPlus className="h-5 w-5 text-accent-blue" aria-hidden="true" />
        </div>
        <span>Start Empty Workout</span>
      </button>

      <div className="space-y-4">
        <SectionHeader
          title="Routines"
          action={
            <IconButton aria-label="Create routine" onClick={() => onNavigate('/routines/new')}>
              <FolderPlus className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <RoutineQuickAction icon={ClipboardPlus} title="New Routine" description="Build a saved template" onClick={() => onNavigate('/routines/new')} />
          <RoutineQuickAction icon={Search} title="Explore" description="Browse exercise library" onClick={() => onNavigate('/exercises')} />
        </div>
      </div>

      {showReorderHint ? (
        <DismissibleBanner icon={ListRestart} tone="warning" onDismiss={onDismissReorderHint}>
          Press and hold a routine to reorder
        </DismissibleBanner>
      ) : null}

      <RoutineGroup title="My Routines" count={routines.length} expanded={routineGroupExpanded} onToggle={onToggleRoutineGroup}>
        {isLoading ? (
          <div className="space-y-3">
            <RoutineCardSkeleton />
            <RoutineCardSkeleton />
          </div>
        ) : loadError ? (
          <ErrorState
            icon={AlertTriangle}
            title="Unable to load routines"
            description={loadError}
            action={
              <SecondaryButton onClick={onRetry}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </SecondaryButton>
            }
          />
        ) : routines.length ? (
          <div className="space-y-3">
            {routines.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                summary={routineSummary(routine.id)}
                onOpen={() => onOpenRoutine(routine.id)}
                onOpenMenu={() => onOpenRoutineMenu(routine.id)}
                onStart={() => onStartRoutine(routine)}
              />
            ))}
          </div>
        ) : (
          <RoutineEmptyState onCreate={() => onNavigate('/routines/new')} />
        )}
      </RoutineGroup>
    </div>
  )
}
