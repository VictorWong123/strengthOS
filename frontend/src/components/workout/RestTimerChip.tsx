import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { formatRestDuration } from './workoutSummary'

type RestTimerChipProps = {
  endAt: number
  onClear: () => void
}

export function RestTimerChip({ endAt, onClear }: RestTimerChipProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const remainingMs = Math.max(0, endAt - now)
  const seconds = Math.ceil(remainingMs / 1000)

  useEffect(() => {
    if (remainingMs > 0) return
    onClear()
  }, [onClear, remainingMs])

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-surface-success px-4 py-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-accent-done">Rest</span>
      <span className="font-semibold text-text-primary">{formatRestDuration(seconds)}</span>
      <button type="button" onClick={onClear} className="-mr-1 rounded-full p-1 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue" aria-label="Clear rest timer">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
