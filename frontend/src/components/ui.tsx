import { House, type LucideIcon, UserRound, Dumbbell, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

type Tone = 'default' | 'warning' | 'danger' | 'success'

type OverlayProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

type AppShellProps = {
  children: ReactNode
  currentPath: string
  onNavigate: (href: string) => void
  hideNavigation?: boolean
}

type MobileHeaderProps = {
  title: ReactNode
  leftAction?: ReactNode
  rightAction?: ReactNode
  left?: ReactNode
  right?: ReactNode
  subtitle?: ReactNode
}

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

type BottomNavigationProps = {
  currentPath: string
  onNavigate: (href: string) => void
}

type SectionHeaderProps = {
  title: string
  count?: number
  subtitle?: string
  action?: ReactNode
}

type BannerProps = {
  icon?: LucideIcon
  tone?: Tone
  children: ReactNode
  onDismiss?: () => void
}

type StateProps = {
  icon: LucideIcon | ReactNode
  title: string
  description: string
  action?: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: House },
  { label: 'Workout', href: '/workout', icon: Dumbbell },
  { label: 'Profile', href: '/profile', icon: UserRound },
]

const OVERLAY_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(clsx(values))
}

export function AppShell({ children, currentPath, onNavigate, hideNavigation = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-page text-text-primary">
      <div className="mx-auto min-h-screen max-w-[760px]">
        <div className={cn('px-4 pb-[calc(100px+env(safe-area-inset-bottom))] md:px-6', hideNavigation && 'pb-8')}>
          {children}
        </div>
      </div>
      {hideNavigation ? null : <BottomNavigation currentPath={currentPath} onNavigate={onNavigate} />}
    </div>
  )
}

export function MobileHeader({ title, leftAction, rightAction, left, right, subtitle }: MobileHeaderProps) {
  const resolvedLeft = leftAction ?? left
  const resolvedRight = rightAction ?? right
  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-white/5 bg-black/90 px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top))] backdrop-blur md:-mx-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {resolvedLeft ? <div className="mb-3">{resolvedLeft}</div> : null}
          <div className="min-w-0">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-text-secondary">{subtitle}</div> : null}
        </div>
        {resolvedRight ? <div className="shrink-0">{resolvedRight}</div> : null}
      </div>
    </header>
  )
}

export function BottomNavigation({ currentPath, onNavigate }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-[760px] rounded-[24px] border border-white/10 bg-surface-card/95 px-2 py-2 shadow-panel backdrop-blur">
        <ul className="grid grid-cols-3 gap-1">
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

export function SurfaceCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-card border border-white/10 bg-surface-card p-4 shadow-panel', className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <SurfaceCard className={className} {...props} />
}

export function PrimaryButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button bg-accent-blue px-4 py-3 text-base font-semibold text-white transition active:bg-accent-pressed disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        className,
      )}
      {...props}
    />
  )
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <PrimaryButton className={className} {...props} />
}

export function SecondaryButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button border border-white/10 bg-surface-input px-4 py-3 text-base font-semibold text-text-primary transition active:bg-surface-elevated disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        className,
      )}
      {...props}
    />
  )
}

export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <SecondaryButton className={className} {...props} />
}

export function IconButton({
  className,
  type = 'button',
  variant = 'surface',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'surface' | 'ghost' | 'danger' }) {
  return (
    <button
      type={type}
      className={cn(
        'touch-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-input text-text-primary transition active:bg-surface-elevated disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        variant === 'ghost' && 'border-transparent bg-transparent',
        variant === 'danger' && 'border-accent-danger/20 bg-surface-danger text-accent-danger',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-base text-text-primary focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[120px] w-full rounded-xl border border-white/10 bg-surface-input px-3 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-surface-input px-3 py-1 text-xs font-medium text-text-secondary',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <Pill className={className} {...props} />
}

export function SectionHeader({ title, count, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {title}
          {typeof count === 'number' ? <span className="ml-2 text-base text-text-muted">{count}</span> : null}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-semibold text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function RoutineQuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex min-h-[76px] min-w-0 items-center gap-3 rounded-card border border-white/10 bg-surface-card p-4 text-left transition active:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      onClick={onClick}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-surface-input text-accent-blue">{icon}</span>
      <span className="min-w-0 truncate font-semibold">{label}</span>
    </button>
  )
}

export function DismissibleBanner({ icon: Icon, tone = 'warning', children, onDismiss }: BannerProps) {
  const toneClass = {
    default: 'bg-surface-input text-text-primary',
    warning: 'bg-surface-warning text-text-primary',
    danger: 'bg-surface-danger text-text-primary',
    success: 'bg-surface-success text-text-primary',
  }[tone]

  return (
    <div className={cn('flex items-start gap-3 rounded-card border border-white/10 px-4 py-3', toneClass)}>
      {Icon ? <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {onDismiss ? (
        <IconButton aria-label="Dismiss message" className="h-9 w-9 border-0 bg-black/10" onClick={onDismiss}>
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  )
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/10 motion-reduce:animate-none', className)} aria-hidden="true" />
}

export function EmptyState({ icon: Icon, title, description, action }: StateProps) {
  return (
    <SurfaceCard className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-input">
        {typeof Icon === 'function' ? <Icon className="h-6 w-6 text-text-secondary" aria-hidden="true" /> : Icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      {action}
    </SurfaceCard>
  )
}

export function ErrorState({
  icon: Icon,
  title,
  description,
  action,
  message,
  onRetry,
}: StateProps & { message?: string; onRetry?: () => void }) {
  const resolvedTitle = title ?? 'Something went wrong'
  const resolvedDescription = description ?? message ?? 'Try again.'
  return (
    <SurfaceCard className="border-accent-danger/20 bg-surface-danger">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-danger/15">
          {typeof Icon === 'function' ? <Icon className="h-5 w-5 text-accent-danger" aria-hidden="true" /> : Icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{resolvedTitle}</h3>
          <p className="mt-1 text-sm text-text-secondary">{resolvedDescription}</p>
          {action ? <div className="mt-4">{action}</div> : null}
          {onRetry ? <PrimaryButton className="mt-4 w-full" onClick={onRetry}>Retry</PrimaryButton> : null}
        </div>
      </div>
    </SurfaceCard>
  )
}

export function BottomSheet({ open, onClose, title, description, children, footer }: OverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const containerRef = useOverlayBehavior(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[760px] px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className="max-h-[85vh] overflow-hidden rounded-modal border border-white/10 bg-surface-card shadow-panel outline-none"
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/15" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 px-4 pb-4 pt-3">
            <div className="min-w-0">
              <h3 id={titleId} className="text-lg font-semibold">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-text-secondary">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton aria-label="Close sheet" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="max-h-[calc(85vh-132px)] overflow-y-auto px-4 pb-4">{children}</div>
          {footer ? <div className="border-t border-white/10 px-4 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, title, description, children, footer }: OverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const containerRef = useOverlayBehavior(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-sm rounded-modal border border-white/10 bg-surface-card p-5 shadow-panel outline-none"
      >
        <h3 id={titleId} className="text-lg font-semibold">
          {title}
        </h3>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm text-text-secondary">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  )
}

function useOverlayBehavior(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const container = containerRef.current
    const focusable = container?.querySelector<HTMLElement>(OVERLAY_FOCUSABLE)
    ;(focusable ?? container)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !container) return

      const elements = [...container.querySelectorAll<HTMLElement>(OVERLAY_FOCUSABLE)].filter(
        (element) => !element.hasAttribute('disabled'),
      )
      if (!elements.length) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return containerRef
}

export function OfflineBadge() {
  const status = useMemo(() => (typeof navigator !== 'undefined' ? navigator.onLine : true), [])
  return status ? null : (
    <DismissibleBanner tone="warning">You are offline. Changes will fail until the connection returns.</DismissibleBanner>
  )
}
