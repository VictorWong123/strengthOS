// Page shell that constrains app width and hosts bottom navigation.
import type { ReactNode } from 'react'
import { BottomNavigation } from './BottomNavigation'
import { cn } from './utils'

type AppShellProps = {
  children: ReactNode
  currentPath: string
  onNavigate: (href: string) => void
  hideNavigation?: boolean
}

export function AppShell({ children, currentPath, onNavigate, hideNavigation = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-page text-text-primary">
      <div className="mx-auto min-h-screen max-w-[760px]">
        <div className={cn('px-4 pb-[calc(132px+env(safe-area-inset-bottom))] md:px-6', hideNavigation && 'pb-8')}>
          {children}
        </div>
      </div>
      {hideNavigation ? null : <BottomNavigation currentPath={currentPath} onNavigate={onNavigate} />}
    </div>
  )
}
