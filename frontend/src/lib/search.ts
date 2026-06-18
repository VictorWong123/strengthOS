export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function expandSearch(value: string): string[] {
  const normalized = normalizeSearch(value)
  const aliases: Record<string, string[]> = {
    'db bench': ['dumbbell bench press', 'dumbbell bench'],
    'smith bench': ['smith machine bench press'],
    rdl: ['romanian deadlift'],
    'lat pull down': ['lat pulldown'],
  }
  return [normalized, ...(aliases[normalized] ?? [])].filter(Boolean)
}
