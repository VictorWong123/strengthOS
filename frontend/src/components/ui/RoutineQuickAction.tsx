// Compact quick-action tile with an icon and label.
import type { ReactNode } from 'react'

export function RoutineQuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex min-h-[76px] min-w-0 items-center gap-3 rounded-card border border-white/10 bg-surface-card p-4 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      onClick={onClick}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-surface-input text-accent-blue">{icon}</span>
      <span className="min-w-0 truncate font-semibold">{label}</span>
    </button>
  )
}
