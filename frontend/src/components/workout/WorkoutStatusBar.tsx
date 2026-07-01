import { RestTimerChip } from './RestTimerChip'
import { WorkoutTimer } from './WorkoutTimer'
import { formatNumber } from './workoutSummary'

type WorkoutStatusBarProps = {
  startedAt: string
  restEndAt: number | null
  completedSets: number
  totalVolume: number
  onClearRest: () => void
}

export function WorkoutStatusBar({
  startedAt,
  restEndAt,
  completedSets,
  totalVolume,
  onClearRest,
}: WorkoutStatusBarProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-40 px-4 pt-[max(12px,env(safe-area-inset-top))] md:px-6">
      <div className="mx-auto max-w-[760px] rounded-[24px] border border-white/10 bg-surface-card/95 px-2 py-2 shadow-panel backdrop-blur">
        <div className="flex items-center gap-2">
          <WorkoutTimer startedAt={startedAt} />
          <div className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <WorkoutStatusMetric label="Sets" value={String(completedSets)} />
            <WorkoutStatusMetric label="Lifted" value={`${formatNumber(totalVolume)} lb`} />
          </div>
          {restEndAt ? <RestTimerChip endAt={restEndAt} onClear={onClearRest} /> : null}
        </div>
      </div>
    </div>
  )
}

function WorkoutStatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-surface-input px-4 py-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="font-semibold text-text-primary">{value}</span>
    </div>
  )
}
