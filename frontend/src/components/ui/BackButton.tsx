// Simple text back button for nested screens.
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-semibold text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
