import { UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Routine, Workout, WorkoutSet } from '../lib/types'
import { IconButton, MobileHeader, SurfaceCard } from './ui'

type HomePageProps = {
  banners: ReactNode
  weeklyCompletedWorkouts: Workout[]
  completedWorkouts: Workout[]
  routines: Routine[]
  exerciseCount: number
  personalRecord: WorkoutSet | null
  onOpenProfile: () => void
}

export function HomePage({
  banners,
  weeklyCompletedWorkouts,
  completedWorkouts,
  routines,
  exerciseCount,
  personalRecord,
  onOpenProfile,
}: HomePageProps) {
  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-4xl font-bold tracking-tight">Home</h1>}
        rightAction={
          <IconButton aria-label="Open profile" onClick={onOpenProfile}>
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
      />
      {banners}
      <SurfaceCard>
        <h2 className="text-xl font-semibold">Weekly Summary</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatCard label="Completed" value={String(weeklyCompletedWorkouts.length)} />
          <StatCard label="Routines" value={String(routines.length)} />
          <StatCard label="Exercises" value={String(exerciseCount)} />
          <StatCard label="Best Set" value={personalRecord ? `${personalRecord.weight ?? 0} x ${personalRecord.reps ?? 0}` : 'None'} />
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <h2 className="text-xl font-semibold">Recent Workout</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {completedWorkouts[0]
            ? `${completedWorkouts[0].name} on ${new Date(completedWorkouts[0].completed_at ?? completedWorkouts[0].started_at).toLocaleDateString()}`
            : 'Finish a workout to see it here.'}
        </p>
      </SurfaceCard>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-input p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}
