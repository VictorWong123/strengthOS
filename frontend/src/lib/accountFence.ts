let activeAccountId: string | null = null

export function setActiveAccount(userId: string | null) {
  activeAccountId = userId
}

export function accountIsActive(userId: string) {
  return activeAccountId === userId
}

export function requireActiveAccount(userId: string) {
  if (!accountIsActive(userId)) throw new Error('Account changed.')
}

export async function fenceAccountMutations(userId: string, currentWork: () => Promise<unknown>[]) {
  if (accountIsActive(userId)) setActiveAccount(null)
  for (;;) {
    const pending = currentWork()
    await Promise.allSettled(pending)
    const next = currentWork()
    if (pending.length === next.length && pending.every((work, index) => work === next[index])) return
  }
}

export async function persistForActiveAccount(
  userId: string,
  operationId: string,
  persist: () => Promise<unknown>,
  remove: (operationId: string) => Promise<unknown>,
) {
  if (!accountIsActive(userId)) return false
  await persist()
  if (accountIsActive(userId)) return true
  await remove(operationId)
  return false
}
