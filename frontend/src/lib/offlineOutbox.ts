import type { WorkoutSet } from './types'

const DATABASE = 'strengthos-recovery'
const STORE = 'operations'

export type SetMutation = {
  kind?: 'set'
  operationId: string
  userId: string
  workoutId: string
  setId: string
  expectedRevision: number
  patch: Partial<WorkoutSet>
  createdAt: string
  state?: 'pending' | 'conflict'
}

export type WorkoutMutation = {
  kind: 'workout'
  operationId: string
  userId: string
  workoutId: string
  expectedRevision: number
  patch: Record<string, unknown>
  createdAt: string
}

export async function queueSetMutation(operation: SetMutation) {
  return request<void>('readwrite', (store) => store.put(operation))
}

export async function removeSetMutation(operationId: string) {
  return request<void>('readwrite', (store) => store.delete(operationId))
}

export async function getSetMutation(operationId: string): Promise<SetMutation | undefined> {
  return request<SetMutation | undefined>('readonly', (store) => store.get(operationId))
}

export async function rebasePendingWorkoutMutations(userId: string, workoutId: string, expectedRevision: number) {
  const operations = await listSetMutations(userId)
  await Promise.all(operations.filter((operation) => operation.workoutId === workoutId).map((operation) =>
    queueSetMutation({ ...operation, expectedRevision }),
  ))
}

export async function markWorkoutMutationsConflict(userId: string, workoutId: string) {
  const operations = await listSetMutations(userId)
  await Promise.all(operations.filter((operation) => operation.workoutId === workoutId).map(markSetMutationConflict))
}

export async function listSetMutations(userId: string, includeConflicts = false): Promise<SetMutation[]> {
  const operations = await request<Array<SetMutation | WorkoutMutation>>('readonly', (store) => store.getAll())
  return operations.filter((operation): operation is SetMutation => operation.kind !== 'workout' && operation.userId === userId && (includeConflicts || operation.state !== 'conflict')).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function queueWorkoutMutation(operation: WorkoutMutation) { return request<void>('readwrite', (store) => store.put(operation)) }
export async function listWorkoutMutations(userId: string): Promise<WorkoutMutation[]> {
  const operations = await request<Array<SetMutation | WorkoutMutation>>('readonly', (store) => store.getAll())
  return operations.filter((operation): operation is WorkoutMutation => operation.kind === 'workout' && operation.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function markSetMutationConflict(operation: SetMutation) {
  return queueSetMutation({ ...operation, state: 'conflict' })
}

export async function clearUserMutations(userId: string) {
  const operations = [...await listSetMutations(userId, true), ...await listWorkoutMutations(userId)]
  await Promise.all(operations.map((operation) => removeSetMutation(operation.operationId)))
}

function request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'operationId' })
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const transaction = open.result.transaction(STORE, mode)
      const operation = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => { resolve(operation.result as T); open.result.close() }
      transaction.onerror = () => { reject(transaction.error ?? operation.error); open.result.close() }
      transaction.onabort = () => { reject(transaction.error ?? new Error('IndexedDB transaction aborted.')); open.result.close() }
    }
  })
}
