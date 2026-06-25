// Ghost button alias for low-emphasis secondary actions.
import type { ButtonHTMLAttributes } from 'react'
import { SecondaryButton } from './SecondaryButton'

export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <SecondaryButton className={className} {...props} />
}
