export function getSafeReturnTo(value: string | null | undefined): string {
  if (!value) return '/'

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return '/'
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/'
  if (decoded.includes('\\')) return '/'

  try {
    const url = new URL(decoded, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function currentInternalPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}
