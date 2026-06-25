// Badge alias for metadata chips that read as labels.
import type { HTMLAttributes } from 'react'
import { Pill } from './Pill'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <Pill className={className} {...props} />
}
