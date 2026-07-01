import { useEffect, useRef } from 'react'
import { cn } from '../ui'

type RestWheelProps = {
  label: string
  value: number
  values: number[]
  onChange: (value: number) => void
}

export function RestWheel({ label, value, values, onChange }: RestWheelProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [value])

  return (
    <div>
      <span className="mb-2 block text-center text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <div
        className="scrollable-touch scrollbar-hidden h-48 overflow-y-auto rounded-2xl border border-white/10 bg-surface-input p-2"
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${label}-${value}`}
        tabIndex={0}
      >
        {values.map((item) => (
          <button
            key={item}
            id={`${label}-${item}`}
            ref={item === value ? selectedRef : undefined}
            type="button"
            className={cn(
              'block min-h-11 w-full rounded-xl text-center text-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
              item === value ? 'bg-accent-blue text-white' : 'text-text-secondary active:bg-surface-elevated',
            )}
            role="option"
            aria-selected={item === value}
            onClick={() => onChange(item)}
          >
            {String(item).padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  )
}
