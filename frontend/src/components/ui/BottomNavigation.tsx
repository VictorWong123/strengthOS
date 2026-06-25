// Fixed bottom navigation for primary app sections.
import { BarChart3, Dumbbell, House, type LucideIcon, UserRound } from 'lucide-react'
import { cn } from './utils'

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

type BottomNavigationProps = {
  currentPath: string
  onNavigate: (href: string) => void
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: House },
  { label: 'Workout', href: '/workout', icon: Dumbbell },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Profile', href: '/profile', icon: UserRound },
]

export function BottomNavigation({ currentPath, onNavigate }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(18px,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-[760px] rounded-[24px] border border-white/10 bg-surface-card/95 px-2 py-2 shadow-panel backdrop-blur">
        <ul className="grid grid-cols-4 gap-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = currentPath === href || (href !== '/' && currentPath.startsWith(href))
            return (
              <li key={href}>
                <button
                  type="button"
                  className={cn(
                    'touch-target flex w-full flex-col items-center justify-center rounded-2xl px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card',
                    active ? 'text-accent-blue' : 'text-[#8E8E93]',
                  )}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(href)}
                >
                  <Icon className="mb-1 h-5 w-5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
