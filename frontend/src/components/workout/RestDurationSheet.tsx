import { useEffect, useState } from 'react'
import { BottomSheet, PrimaryButton, SecondaryButton } from '../ui'
import { RestWheel } from './RestWheel'

const REST_MINUTES = Array.from({ length: 60 }, (_, index) => index)
const REST_SECONDS = Array.from({ length: 60 }, (_, index) => index)

type RestDurationSheetProps = {
  open: boolean
  title: string
  value: number
  onClose: () => void
  onSave: (seconds: number) => void
}

export function RestDurationSheet({
  open,
  title,
  value,
  onClose,
  onSave,
}: RestDurationSheetProps) {
  const [minutes, setMinutes] = useState(() => Math.floor(value / 60))
  const [seconds, setSeconds] = useState(() => value % 60)

  useEffect(() => {
    setMinutes(Math.floor(value / 60))
    setSeconds(value % 60)
  }, [value, open])

  const nextSeconds = Math.max(1, minutes * 60 + seconds)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      description="Scroll to choose minutes and seconds."
      footer={
        <div className="flex gap-3">
          <SecondaryButton className="flex-1" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={() => onSave(nextSeconds)}>
            Set
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <RestWheel label="Min" value={minutes} values={REST_MINUTES} onChange={setMinutes} />
        <RestWheel label="Sec" value={seconds} values={REST_SECONDS} onChange={setSeconds} />
      </div>
    </BottomSheet>
  )
}
