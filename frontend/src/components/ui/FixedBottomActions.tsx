// Fixed bottom action bar for mobile forms and workout flows.
import type { ReactNode } from 'react'

type FixedBottomActionsProps = {
  children: ReactNode
}

export function FixedBottomActions({ children }: FixedBottomActionsProps) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] z-20 px-4 md:px-6">
      <div className="mx-auto flex max-w-[760px] gap-3">{children}</div>
    </div>
  )
}
