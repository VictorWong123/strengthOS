import { Capacitor, registerPlugin } from '@capacitor/core'

type WorkoutDevicePlugin = {
  setKeepAwake(options: { enabled: boolean }): Promise<void>
  vibrate(): Promise<void>
}

const WorkoutDevice = registerPlugin<WorkoutDevicePlugin>('WorkoutDevice')

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export async function setNativeKeepAwake(enabled: boolean) {
  await WorkoutDevice.setKeepAwake({ enabled })
}

export async function vibrateWorkoutAlert() {
  if (isNativeApp()) {
    try {
      await WorkoutDevice.vibrate()
      return
    } catch {
      // Fall back to the web vibration API when the native bridge is unavailable.
    }
  }
  navigator.vibrate?.([150, 80, 150])
}
