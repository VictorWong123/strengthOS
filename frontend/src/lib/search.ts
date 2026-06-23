export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const TOKEN_ALIASES: Record<string, string> = {
  db: 'dumbbell',
  dumbbells: 'dumbbell',
  inclined: 'incline',
  inclines: 'incline',
  declined: 'decline',
  declines: 'decline',
  pulldowns: 'pulldown',
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'of', 'the', 'to', 'with'])

export type SearchIndex = {
  text: string
  tokens: Set<string>
  sortedTokenKey: string
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

export function searchTokens(value: string): string[] {
  return Array.from(
    new Set(
      normalizeSearch(value)
        .split(' ')
        .map(normalizeToken)
        .filter((token) => token && !STOP_WORDS.has(token)),
    ),
  )
}

export function createSearchIndex(value: string): SearchIndex {
  const tokens = searchTokens(value)
  return {
    text: normalizeSearch(value),
    tokens: new Set(tokens),
    sortedTokenKey: tokens.slice().sort().join(' '),
  }
}

export function exerciseSearchScore(query: string, searchable: string | SearchIndex): number {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return 1

  const searchIndex = typeof searchable === 'string' ? createSearchIndex(searchable) : searchable
  const phraseMatches = expandSearch(query).filter((term) => searchIndex.text.includes(term))
  if (phraseMatches.length) return 100 + Math.max(...phraseMatches.map((term) => term.length))

  const queryTokens = searchTokens(query)
  if (!queryTokens.length) return 1

  if (!queryTokens.every((token) => searchIndex.tokens.has(token))) return 0

  const queryTokenKey = queryTokens.slice().sort().join(' ')
  const sameWordsBonus = searchIndex.sortedTokenKey.includes(queryTokenKey) ? 30 : 0
  const contiguousBonus = searchIndex.text.includes(queryTokens.join(' ')) ? 20 : 0
  return 50 + sameWordsBonus + contiguousBonus + queryTokens.length
}

function normalizeToken(token: string): string {
  const alias = TOKEN_ALIASES[token]
  if (alias) return alias
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1)
  return token
}
