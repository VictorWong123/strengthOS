const DEFAULT_RETURN_TO = '/'

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

export function getSafeReturnToFromSearch(search = window.location.search, origin = window.location.origin): string {
  return getSafeReturnTo(new URLSearchParams(search).get('returnTo'), origin)
}

export function currentInternalPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}
