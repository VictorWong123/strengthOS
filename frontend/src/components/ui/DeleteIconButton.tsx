// Icon-only delete button for compact destructive actions.
import { Trash2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { IconButton } from './IconButton'

type DeleteIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
}

export function DeleteIconButton({ label, className, type = 'button', ...props }: DeleteIconButtonProps) {
  return (
    <IconButton aria-label={label} title={label} variant="danger" className={className} type={type} {...props}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </IconButton>
  )
}
