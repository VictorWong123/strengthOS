const PENDING_ACCOUNT_CLEANUP_KEY = 'strengthos:pending-account-cleanup'

export function clearAccountLocalStorage(storage: Storage, userId: string, workoutIds: string[]) {
  storage.removeItem(`strengthos:routine-order:${userId}`)
  for (const workoutId of workoutIds) {
    storage.removeItem(`strengthos:rest:${workoutId}`)
    storage.removeItem(`strengthos:rest-overrides:${workoutId}`)
  }
}

export function markPendingAccountCleanup(storage: Storage, userId: string) {
  storage.setItem(PENDING_ACCOUNT_CLEANUP_KEY, userId)
}

export function pendingAccountCleanup(storage: Storage) {
  return storage.getItem(PENDING_ACCOUNT_CLEANUP_KEY)
}

export function finishPendingAccountCleanup(storage: Storage, userId: string) {
  if (storage.getItem(PENDING_ACCOUNT_CLEANUP_KEY) === userId) storage.removeItem(PENDING_ACCOUNT_CLEANUP_KEY)
}
