import { AlertTriangle, ChevronDown, ClipboardPlus, FolderPlus, ListRestart, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import type { Routine } from '../lib/types'
import { RoutineCard, RoutineCardSkeleton, RoutineEmptyState, RoutineGroup, RoutineQuickAction } from './RoutineUI'
import { DismissibleBanner, ErrorState, IconButton, MobileHeader, SecondaryButton, SectionHeader, cn } from './ui'

const ROUTINE_REORDER_HOLD_MS = 350
const ROUTINE_REORDER_MOVE_TOLERANCE_PX = 8

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
  onReorderRoutines: (routineIds: string[]) => void
}

type RoutineDragRef = {
  id: string
  pointerId: number
  startY: number
  isDragging: boolean
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
  onReorderRoutines,
}: WorkoutPageProps) {
  const [draggingRoutineId, setDraggingRoutineId] = useState<string | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const dragRef = useRef<RoutineDragRef | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const suppressClickRoutineRef = useRef<string | null>(null)

  function clearHoldTimer() {
    if (!holdTimerRef.current) return
    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }

  function setRoutineItemRef(routineId: string, node: HTMLDivElement | null) {
    if (node) {
      itemRefs.current.set(routineId, node)
      return
    }
    itemRefs.current.delete(routineId)
  }

  function beginRoutineDrag(routineId: string) {
    const drag = dragRef.current
    if (!drag || drag.id !== routineId) return
    drag.isDragging = true
    setDragOffsetY(0)
    setDraggingRoutineId(routineId)
  }

  function handleRoutinePointerDown(event: PointerEvent<HTMLDivElement>, routineId: string) {
    if (event.button !== 0 || !event.isPrimary) return
    if ((event.target as HTMLElement).closest('[data-routine-drag-ignore]')) return

    clearHoldTimer()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: routineId,
      pointerId: event.pointerId,
      startY: event.clientY,
      isDragging: false,
    }
    holdTimerRef.current = window.setTimeout(() => beginRoutineDrag(routineId), ROUTINE_REORDER_HOLD_MS)
  }

  function handleRoutinePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaY = Math.abs(event.clientY - drag.startY)
    if (!drag.isDragging) {
      if (deltaY > ROUTINE_REORDER_MOVE_TOLERANCE_PX) {
        clearHoldTimer()
        dragRef.current = null
      }
      return
    }

    event.preventDefault()
    setDragOffsetY(event.clientY - drag.startY)
    const currentIndex = routines.findIndex((routine) => routine.id === drag.id)
    if (currentIndex < 0) return

    const itemCenters = routines
      .filter((routine) => routine.id !== drag.id)
      .map((routine) => {
        const rect = itemRefs.current.get(routine.id)?.getBoundingClientRect()
        return rect ? { centerY: rect.top + rect.height / 2 } : null
      })
      .filter((item): item is { centerY: number } => Boolean(item))

    const firstAfterPointer = itemCenters.find((item) => event.clientY < item.centerY)
    const nextIndex = firstAfterPointer ? itemCenters.indexOf(firstAfterPointer) : itemCenters.length
    if (nextIndex === currentIndex) return

    const nextRoutineIds = routines.map((routine) => routine.id)
    const [target] = nextRoutineIds.splice(currentIndex, 1)
    nextRoutineIds.splice(nextIndex, 0, target)
    drag.startY = event.clientY
    setDragOffsetY(0)
    onReorderRoutines(nextRoutineIds)
  }

  function handleRoutinePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    clearHoldTimer()
    if (drag.isDragging) {
      event.preventDefault()
      event.stopPropagation()
      suppressClickRoutineRef.current = drag.id
      window.setTimeout(() => {
        if (suppressClickRoutineRef.current === drag.id) suppressClickRoutineRef.current = null
      }, 700)
    }
    dragRef.current = null
    setDraggingRoutineId(null)
    setDragOffsetY(0)
  }

  function handleRoutineClickCapture(event: MouseEvent<HTMLDivElement>, routineId: string) {
    if (suppressClickRoutineRef.current !== routineId) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRoutineRef.current = null
  }

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
              <div
                key={routine.id}
                ref={(node) => setRoutineItemRef(routine.id, node)}
                className={cn(
                  'relative touch-pan-y transition-transform duration-150',
                  draggingRoutineId === routine.id && 'z-20 cursor-grabbing select-none touch-none opacity-95 duration-0',
                )}
                style={
                  draggingRoutineId === routine.id
                    ? { transform: `translate3d(0, ${dragOffsetY}px, 0) scale(1.03)` }
                    : undefined
                }
                onPointerDown={(event) => handleRoutinePointerDown(event, routine.id)}
                onPointerMove={handleRoutinePointerMove}
                onPointerUp={handleRoutinePointerEnd}
                onPointerCancel={handleRoutinePointerEnd}
                onClickCapture={(event) => handleRoutineClickCapture(event, routine.id)}
              >
                <RoutineCard
                  routine={routine}
                  summary={routineSummary(routine.id)}
                  isReordering={draggingRoutineId === routine.id}
                  onOpen={() => onOpenRoutine(routine.id)}
                  onOpenMenu={() => onOpenRoutineMenu(routine.id)}
                  onStart={() => onStartRoutine(routine)}
                />
              </div>
            ))}
          </div>
        ) : (
          <RoutineEmptyState onCreate={() => onNavigate('/routines/new')} />
        )}
      </RoutineGroup>
    </div>
  )
}
