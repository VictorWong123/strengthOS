// Label wrapper for a single form control.
import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  children: ReactNode
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  )
}
