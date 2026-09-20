export const DEFAULT_TIME_ZONE = 'America/New_York'

export function normalizeTimeZone(value: string | null | undefined) {
  if (!value) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

export function dateKeyInTimeZone(value: string | number | Date, timeZone = DEFAULT_TIME_ZONE) {
  const safeTimeZone = normalizeTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function sundayDateKey(timeZone = DEFAULT_TIME_ZONE, now: string | number | Date = new Date()) {
  const [year, month, day] = dateKeyInTimeZone(now, timeZone).split('-').map(Number)
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  calendarDate.setUTCDate(calendarDate.getUTCDate() - calendarDate.getUTCDay())
  return calendarDate.toISOString().slice(0, 10)
}
