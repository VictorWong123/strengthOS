const DEFAULT_RETURN_TO = '/'

export type ReturnToResolution = {
  rawSearch: string
  rawReturnTo: string | null
  parsedReturnTo: string | null
  validatedReturnTo: string
}

export function getSafeReturnTo(value: string | null | undefined, origin = window.location.origin): string {
  if (!value) return '/'

  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_RETURN_TO
  if (value.includes('\\')) return DEFAULT_RETURN_TO

  try {
    const url = new URL(value, origin)
    if (url.origin !== origin) return DEFAULT_RETURN_TO
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return DEFAULT_RETURN_TO
  }
}

export function resolveReturnToFromSearch(search = window.location.search, origin = window.location.origin): ReturnToResolution {
  const rawReturnTo = getRawQueryParam(search, 'returnTo')
  const parsedReturnTo = new URLSearchParams(search).get('returnTo')
  return {
    rawSearch: search,
    rawReturnTo,
    parsedReturnTo,
    validatedReturnTo: getSafeReturnTo(parsedReturnTo, origin),
  }
}

export function getSafeReturnToFromSearch(search = window.location.search, origin = window.location.origin): string {
  return resolveReturnToFromSearch(search, origin).validatedReturnTo
}

export function currentInternalPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function getRawQueryParam(search: string, name: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  if (!query) return null

  for (const part of query.split('&')) {
    const separatorIndex = part.indexOf('=')
    const rawKey = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part
    const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : ''
    if (safeDecode(rawKey.replace(/\+/g, ' ')) === name) return rawValue
  }

  return null
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
