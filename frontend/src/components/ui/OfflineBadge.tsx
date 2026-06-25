// Offline warning banner based on the current browser network state.
import { useMemo } from 'react'
import { DismissibleBanner } from './DismissibleBanner'

export function OfflineBadge() {
  const status = useMemo(() => (typeof navigator !== 'undefined' ? navigator.onLine : true), [])
  return status ? null : (
    <DismissibleBanner tone="warning">You are offline. Changes will fail until the connection returns.</DismissibleBanner>
  )
}
