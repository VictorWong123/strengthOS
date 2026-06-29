// Bottom-docked modal sheet for mobile-first secondary flows.
import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { useOverlayBehavior } from './overlayBehavior'
import { cn } from './utils'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  headerAction?: ReactNode
  className?: string
  contentClassName?: string
  position?: 'bottom' | 'top'
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerAction,
  className,
  contentClassName,
  position = 'bottom',
}: BottomSheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const containerRef = useOverlayBehavior(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className={cn(
          'absolute inset-x-0 mx-auto max-w-[760px] px-3',
          position === 'top'
            ? 'top-[max(18px,env(safe-area-inset-top))]'
            : 'bottom-0 pb-[max(18px,env(safe-area-inset-bottom))]',
        )}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            'flex max-h-[92dvh] flex-col overflow-hidden rounded-modal border border-white/10 bg-surface-card shadow-panel outline-none',
            className,
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/15" aria-hidden="true" />
          <div className="shrink-0 flex items-start justify-between gap-4 px-4 pb-4 pt-3">
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-semibold">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-text-secondary">
                  {description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {headerAction}
              <IconButton aria-label="Close sheet" onClick={onClose}>
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div className={cn('scrollable-touch min-h-0 flex-1 overflow-y-auto px-4 pb-4', contentClassName)}>{children}</div>
          {footer ? <div className="shrink-0 border-t border-white/10 px-4 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
