// Centered confirmation dialog for risky or irreversible actions.
import { useId, type ReactNode } from 'react'
import { useOverlayBehavior } from './overlayBehavior'

type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function ConfirmDialog({ open, onClose, title, description, children, footer }: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const containerRef = useOverlayBehavior(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-sm rounded-modal border border-white/10 bg-surface-card p-5 shadow-panel outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          {title}
        </h3>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm text-text-secondary">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  )
}
