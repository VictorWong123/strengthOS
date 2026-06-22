const SET_META_PREFIX = '__strengthos_meta__:'

export type RoutineTarget = {
  minReps: string
  maxReps: string
  rpe: string
}

type SetMeta = {
  note?: string | null
  rpe?: number | null
}

export function parseRoutineTarget(targetReps: string | null): RoutineTarget {
  if (!targetReps) {
    return { minReps: '', maxReps: '', rpe: '' }
  }

  const match = targetReps.match(/^\s*(\d+)(?:\s*-\s*(\d+))?(?:\s*@\s*(\d+(?:\.\d+)?))?\s*$/)
  if (!match) {
    return { minReps: targetReps.trim(), maxReps: '', rpe: '' }
  }

  return {
    minReps: match[1] ?? '',
    maxReps: match[2] ?? '',
    rpe: match[3] ?? '',
  }
}

export function formatRoutineTarget(target: RoutineTarget): string | null {
  const min = target.minReps.trim()
  const max = target.maxReps.trim()
  const rpe = target.rpe.trim()

  if (!min && !max && !rpe) return null

  const repText = min && max ? `${min}-${max}` : min || max
  if (!repText) return rpe ? `@${rpe}` : null

  return rpe ? `${repText} @${rpe}` : repText
}

export function parseSetRpe(notes: string | null): string {
  const meta = parseSetMeta(notes)
  return meta?.rpe === null || meta?.rpe === undefined ? '' : String(meta.rpe)
}

export function mergeSetRpe(notes: string | null, rpe: string): string | null {
  const trimmed = rpe.trim()
  const existing = parseSetMeta(notes)
  const nextNote = existing?.note ?? (existing ? null : notes)

  if (!trimmed) {
    if (!existing) return notes
    if (!nextNote) return null
    return nextNote
  }

  const numericRpe = Number(trimmed)
  if (!Number.isFinite(numericRpe)) {
    return notes
  }

  const payload: SetMeta = { note: nextNote ?? null, rpe: numericRpe }
  return `${SET_META_PREFIX}${JSON.stringify(payload)}`
}

function parseSetMeta(notes: string | null): SetMeta | null {
  if (!notes?.startsWith(SET_META_PREFIX)) return null

  try {
    return JSON.parse(notes.slice(SET_META_PREFIX.length)) as SetMeta
  } catch {
    return null
  }
}
