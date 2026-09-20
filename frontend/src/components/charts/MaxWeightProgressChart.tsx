import { TrendChart } from './TrendChart'
import type { ExerciseSession } from './types'

export function MaxWeightProgressChart({ sessions }: { sessions: ExerciseSession[] }) {
  return (
    <TrendChart
      title="Max Weight"
      unit="lb"
      data={sessions.flatMap((session) => session.maxWeight === null ? [] : [{ label: session.label, value: session.maxWeight }])}
      tone="green"
    />
  )
}
