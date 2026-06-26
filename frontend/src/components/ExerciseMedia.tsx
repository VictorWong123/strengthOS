import { useEffect, useRef, useState, type ReactNode } from 'react'

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
  const sources = normalizeSources(src)
  const sourceKey = sources.join('\n')
  const resolvedUrl = resolveMediaUrl(sources[failedIndex] ?? null)
  const shouldLoad = loading === 'eager' || isInView
  const mediaUrl = !shouldLoad ? null : resolvedUrl
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
  return sources.filter(Boolean)
}

function resolveMediaUrl(src: string | null): string | null {
  if (!src) return null
  if (apiUrl && src.startsWith('/api/')) return `${apiUrl}${src.slice('/api'.length)}`
  return src
}
