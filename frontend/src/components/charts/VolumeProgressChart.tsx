import { TrendChart } from './TrendChart'
import type { ExerciseSession } from './types'

export function VolumeProgressChart({ sessions }: { sessions: ExerciseSession[] }) {
  return (
    <TrendChart
      title="Volume"
      unit="lb"
      data={sessions.map((session) => ({ label: session.label, value: session.volume }))}
      tone="blue"
    />
  )
}
