// Backward-compatible alias for the primary button.
import type { ButtonHTMLAttributes } from 'react'
import { PrimaryButton } from './PrimaryButton'

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <PrimaryButton className={className} {...props} />
}
