import { useEffect, useState } from 'react'
import { TimerPill } from '../ui'

export function WorkoutTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime())
  const hours = Math.floor(elapsedMs / 3_600_000)
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1000)

  return (
    <TimerPill>
      {hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`}
    </TimerPill>
  )
}
