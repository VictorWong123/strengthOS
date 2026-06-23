import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { SurfaceCard, cn } from '../ui'

const DAY_MS = 24 * 60 * 60 * 1000
const HEATMAP_WEEKS = 52

export function WorkoutHeatmap({ dates }: { dates: string[] }) {
  const cells = useMemo(() => buildHeatmapCells(dates), [dates])
  const totalWorkouts = dates.length
  const activeDays = cells.filter((cell) => cell.count > 0).length

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Workout Heatmap</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {totalWorkouts} workouts on {activeDays} days
          </p>
        </div>
        <BarChart3 className="mt-1 h-5 w-5 text-accent-done" aria-hidden="true" />
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[728px] grid-flow-col grid-rows-7 gap-1">
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={cn('h-3 w-3 rounded-[3px]', heatmapColor(cell.count))}
              title={`${cell.label}: ${cell.count} workout${cell.count === 1 ? '' : 's'}`}
              aria-label={`${cell.label}: ${cell.count} workout${cell.count === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      </div>
    </SurfaceCard>
  )
}

function buildHeatmapCells(dates: string[]) {
  const countByDate = new Map<string, number>()
  for (const date of dates) {
    const key = dateKey(new Date(date))
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1)
  }

  const today = startOfDay(new Date())
  const end = new Date(today)
  end.setDate(today.getDate() + (6 - today.getDay()))
  const start = new Date(end.getTime() - (HEATMAP_WEEKS * 7 - 1) * DAY_MS)

  return Array.from({ length: HEATMAP_WEEKS * 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS)
    const key = dateKey(date)
    return {
      key,
      count: countByDate.get(key) ?? 0,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    }
  })
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateKey(date: Date) {
  const localDate = startOfDay(date)
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
}

function heatmapColor(count: number) {
  if (count <= 0) return 'bg-white/10'
  if (count === 1) return 'bg-emerald-900'
  if (count === 2) return 'bg-emerald-700'
  if (count === 3) return 'bg-emerald-500'
  return 'bg-emerald-300'
}
