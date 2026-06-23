import { useState, type ReactNode } from 'react'

type ExerciseMediaProps = {
  src: string | null
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
  const [failed, setFailed] = useState(false)
  const mediaUrl = failed ? null : resolveMediaUrl(src)
  const isVideo = Boolean(mediaUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(mediaUrl))

  if (!mediaUrl) return fallback

  return isVideo ? (
    <video
      src={mediaUrl}
      controls={controls}
      preload="metadata"
      onError={() => setFailed(true)}
      className={videoClassName}
      aria-label={alt}
    />
  ) : (
    <img
      src={mediaUrl}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

function resolveMediaUrl(src: string | null): string | null {
  if (!src) return null
  if (apiUrl && src.startsWith('/api/')) return `${apiUrl}${src.slice('/api'.length)}`
  return src
}
