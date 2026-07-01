import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../../lib/types'
import { BottomSheet, DeleteIconButton, MetricCard, PrimaryButton } from '../ui'
import { buildWorkoutSummary, formatDuration, formatNumber, type ExerciseRecord } from './workoutSummary'

type FinishWorkoutSheetProps = {
  open: boolean
  workout: Workout
  workoutExercises: WorkoutExercise[]
  setsByWorkoutExercise: Map<string, WorkoutSet[]>
  exerciseById: Map<string, Exercise>
  historicalRecordsByExerciseId: Map<string, ExerciseRecord>
  onClose: () => void
  onSave: () => void
  onDiscard: () => void
}

export function FinishWorkoutSheet({
  open,
  workout,
  workoutExercises,
  setsByWorkoutExercise,
  exerciseById,
  historicalRecordsByExerciseId,
  onClose,
  onSave,
  onDiscard,
}: FinishWorkoutSheetProps) {
  const summary = buildWorkoutSummary({
    workout,
    workoutExercises,
    setsByWorkoutExercise,
    exerciseById,
    historicalRecordsByExerciseId,
  })

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Finish Workout"
      description="Review the session before saving."
      footer={
        <div className="grid gap-3">
          <PrimaryButton onClick={onSave}>Save Workout</PrimaryButton>
        </div>
      }
      headerAction={
        <DeleteIconButton
          label="Discard workout"
          className="mr-2 h-10 w-10"
          onClick={onDiscard}
        />
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="Lifted" value={`${formatNumber(summary.totalVolume)} lb`} valueClassName="text-lg" />
          <MetricCard label="Sets" value={String(summary.completedSets)} valueClassName="text-lg" />
          <MetricCard label="Time" value={formatDuration(summary.durationSeconds)} valueClassName="text-lg" />
        </div>

        <div>
          <h3 className="text-base font-semibold">Records</h3>
          {summary.prs.length ? (
            <div className="mt-3 space-y-2">
              {summary.prs.map((pr) => (
                <div key={`${pr.exerciseName}-${pr.kind}`} className="rounded-2xl border border-accent-done/20 bg-surface-success px-3 py-3">
                  <div className="text-sm font-semibold text-accent-done">{pr.kind} PR</div>
                  <div className="mt-1 text-sm">{pr.exerciseName}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {formatNumber(pr.value)} {pr.unit}
                    {pr.previous > 0 ? ` beat ${formatNumber(pr.previous)} ${pr.unit}` : ' first recorded PR'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-2xl bg-surface-input px-3 py-3 text-sm text-text-secondary">No new PRs this session.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
