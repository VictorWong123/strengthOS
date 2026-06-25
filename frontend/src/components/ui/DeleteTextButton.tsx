// Text delete button for destructive list and row actions.
import { Trash2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

type DeleteTextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
}

export function DeleteTextButton({ label = 'Delete', children, className, type = 'button', ...props }: DeleteTextButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-danger transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
        className,
      )}
      {...props}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {children ?? label}
    </button>
  )
}
