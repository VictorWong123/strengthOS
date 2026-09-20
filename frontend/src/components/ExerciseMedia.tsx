import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type ExerciseMediaProps = {
  src: string | string[] | null
  alt: string
  fallback: ReactNode
  className: string
  videoClassName?: string
  controls?: boolean
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'auto' | 'sync'
}

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const authenticatedMedia = new Map<string, { url: string; uses: number; cleanup?: number }>()
const authenticatedMediaRequests = new Map<string, Promise<Blob>>()

export function ExerciseMedia({
  src,
  alt,
  fallback,
  className,
  videoClassName = className,
  controls = false,
  loading = 'lazy',
  decoding,
}: ExerciseMediaProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const [failedIndex, setFailedIndex] = useState(0)
  const [isInView, setIsInView] = useState(loading === 'eager')
  const [authenticatedUrl, setAuthenticatedUrl] = useState<string | null>(null)
  const sources = normalizeSources(src)
  const sourceKey = sources.join('\n')
  const resolvedUrl = resolveMediaUrl(sources[failedIndex] ?? null)
  const shouldLoad = loading === 'eager' || isInView
  const needsAuthentication = Boolean(resolvedUrl && isApiMediaUrl(resolvedUrl))
  const mediaUrl = !shouldLoad ? null : needsAuthentication ? authenticatedUrl : resolvedUrl
  const isVideo = Boolean(mediaUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(mediaUrl))

  useEffect(() => {
    setFailedIndex(0)
    setIsInView(loading === 'eager')
  }, [loading, sourceKey])

  useEffect(() => {
    if (!resolvedUrl || loading === 'eager' || isInView) return
    const element = containerRef.current
    if (!element) return
    if (!('IntersectionObserver' in window)) {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setIsInView(true)
        observer.disconnect()
      },
      { rootMargin: '0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isInView, loading, resolvedUrl])

  useEffect(() => {
    if (!shouldLoad || !resolvedUrl || !needsAuthentication) {
      setAuthenticatedUrl(null)
      return
    }
    let active = true
    let acquired = false
    void acquireAuthenticatedMedia(resolvedUrl)
      .then((url) => {
        acquired = true
        if (active) setAuthenticatedUrl(url)
        else {
          releaseAuthenticatedMedia(resolvedUrl)
          acquired = false
        }
      })
      .catch(() => {
        if (active) setFailedIndex((current) => current + 1)
      })
    return () => {
      active = false
      if (acquired) releaseAuthenticatedMedia(resolvedUrl)
    }
  }, [needsAuthentication, resolvedUrl, shouldLoad])

  if (!mediaUrl) return <span ref={containerRef}>{fallback}</span>

  return isVideo ? (
    <video
      src={mediaUrl}
      controls={controls}
      preload="metadata"
      onError={() => setFailedIndex((current) => current + 1)}
      className={videoClassName}
      aria-label={alt}
    />
  ) : (
    <img
      src={mediaUrl}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={() => setFailedIndex((current) => current + 1)}
      className={className}
    />
  )
}

function normalizeSources(src: string | string[] | null): string[] {
  if (!src) return []
  const sources = Array.isArray(src) ? src : [src]
  return [...new Set(sources.filter(Boolean))]
}

function resolveMediaUrl(src: string | null): string | null {
  if (!src) return null
  if (apiUrl && src.startsWith('/api/')) return `${apiUrl}${src.slice('/api'.length)}`
  return src
}

function isApiMediaUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.origin)
    const expectedOrigin = apiUrl ? new URL(apiUrl, window.location.origin).origin : window.location.origin
    return parsed.origin === expectedOrigin && /^\/(?:api\/)?exercise-images\/[A-Za-z0-9_-]+$/.test(parsed.pathname)
  } catch {
    return false
  }
}

async function acquireAuthenticatedMedia(url: string): Promise<string> {
  const cached = authenticatedMedia.get(url)
  if (cached) {
    if (cached.cleanup) window.clearTimeout(cached.cleanup)
    cached.uses += 1
    return cached.url
  }

  let request = authenticatedMediaRequests.get(url)
  if (!request) {
    request = fetchAuthenticatedMedia(url)
    authenticatedMediaRequests.set(url, request)
  }
  const blob = await request.finally(() => authenticatedMediaRequests.delete(url))
  const existing = authenticatedMedia.get(url)
  if (existing) {
    existing.uses += 1
    return existing.url
  }
  const objectUrl = URL.createObjectURL(blob)
  authenticatedMedia.set(url, { url: objectUrl, uses: 1 })
  return objectUrl
}

async function fetchAuthenticatedMedia(url: string): Promise<Blob> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to load exercise media.')
  const response = await fetch(url, {
    cache: 'force-cache',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Exercise media request failed: ${response.status}`)
  return response.blob()
}

function releaseAuthenticatedMedia(url: string) {
  const cached = authenticatedMedia.get(url)
  if (!cached) return
  cached.uses = Math.max(0, cached.uses - 1)
  if (cached.uses > 0) return
  cached.cleanup = window.setTimeout(() => {
    const current = authenticatedMedia.get(url)
    if (!current || current.uses > 0) return
    URL.revokeObjectURL(current.url)
    authenticatedMedia.delete(url)
  }, 60_000)
}
