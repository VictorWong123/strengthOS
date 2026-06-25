// Shared state-icon renderer for empty and error states.
import { isValidElement, type ElementType, type ReactNode } from 'react'

export type StateIcon = ElementType | ReactNode

export function renderStateIcon(icon: StateIcon, className: string) {
  if (isValidElement(icon)) return icon
  const Icon = icon as ElementType
  return <Icon className={className} aria-hidden="true" />
}
