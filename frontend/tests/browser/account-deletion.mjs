import assert from 'node:assert/strict'
import { startHarness, ACTIVE, BASE, USER } from './harness.mjs'

let accountDeletes = 0
const qa = await startHarness({
  backend: ({ entry, url, fulfill }) => {
    if (entry.method === 'DELETE' && url.pathname === '/api/account') {
      accountDeletes += 1
      return fulfill({ deleted: true })
    }
    return fulfill({ message: 'Unhandled QA backend route' }, 501)
  },
})
const page = qa.page
const otherUser = '10000000-0000-4000-8000-000000000099'
const report = { name: 'account deletion retries device cleanup without deleting another account data', passed: false }

async function until(predicate, message) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.fail(message)
}

try {
  await page.goto(`${BASE}/profile`)
  await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor()
  await page.evaluate(async ({ userId, otherUser, activeWorkout }) => {
    localStorage.setItem(`strengthos:routine-order:${userId}`, '["routine-1"]')
    localStorage.setItem(`strengthos:routine-order:${otherUser}`, '["routine-2"]')
    localStorage.setItem(`strengthos:rest:${activeWorkout}`, '100')
    localStorage.setItem('strengthos:rest:workout-user-2', '200')
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('strengthos-recovery', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('operations', { keyPath: 'operationId' })
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const transaction = open.result.transaction('operations', 'readwrite')
        const store = transaction.objectStore('operations')
        store.put({ operationId: 'delete-me', userId, workoutId: 'workout-user-1', setId: 'set-1', expectedRevision: 0, patch: { weight: 10 }, createdAt: new Date().toISOString() })
        store.put({ kind: 'workout', operationId: 'keep-me', userId: otherUser, workoutId: 'workout-user-2', expectedRevision: 0, patch: { notes: 'keep' }, createdAt: new Date().toISOString() })
        transaction.oncomplete = () => { open.result.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })

    await new Promise((resolve, reject) => {
      const upgrade = indexedDB.open('strengthos-recovery', 2)
      upgrade.onerror = () => reject(upgrade.error)
      upgrade.onsuccess = () => { upgrade.result.close(); resolve() }
    })
  }, { userId: USER, otherUser, activeWorkout: ACTIVE })

  await page.getByRole('slider', { name: 'Confirm account deletion' }).press('End')
  await page.getByRole('button', { name: 'Delete account', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
  assert.equal(accountDeletes, 1)
  assert.equal(await page.evaluate(() => localStorage.getItem('strengthos:pending-account-cleanup')), USER)
  assert(qa.events.errors.length > 0 && qa.events.errors.every((message) => message.includes('less than the existing version')), 'Only simulated IndexedDB failures expected')
  qa.events.errors.length = 0

  await page.evaluate(async () => {
    const rows = await new Promise((resolve, reject) => {
      const open = indexedDB.open('strengthos-recovery', 2)
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const transaction = open.result.transaction('operations', 'readonly')
        const request = transaction.objectStore('operations').getAll()
        transaction.oncomplete = () => { open.result.close(); resolve(request.result) }
        transaction.onerror = () => reject(transaction.error)
      }
    })
    await new Promise((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('strengthos-recovery')
      deletion.onerror = () => reject(deletion.error)
      deletion.onsuccess = () => resolve()
    })
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('strengthos-recovery', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('operations', { keyPath: 'operationId' })
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const transaction = open.result.transaction('operations', 'readwrite')
        const store = transaction.objectStore('operations')
        for (const row of rows) store.put(row)
        transaction.oncomplete = () => { open.result.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
  await page.reload()
  await until(
    () => page.evaluate(() => localStorage.getItem('strengthos:pending-account-cleanup') === null),
    'Startup should retry failed IndexedDB cleanup',
  )
  const remaining = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('strengthos-recovery', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const transaction = open.result.transaction('operations', 'readonly')
      const request = transaction.objectStore('operations').getAll()
      transaction.oncomplete = () => { open.result.close(); resolve(request.result) }
      transaction.onerror = () => reject(transaction.error)
    }
  }))
  assert.deepEqual(remaining.map((operation) => operation.operationId), ['keep-me'])
  assert.equal(await page.evaluate((id) => localStorage.getItem(`strengthos:routine-order:${id}`), USER), null)
  assert.equal(await page.evaluate((id) => localStorage.getItem(`strengthos:rest:${id}`), ACTIVE), null)
  assert.equal(await page.evaluate((id) => localStorage.getItem(`strengthos:routine-order:${id}`), otherUser), '["routine-2"]')
  assert.equal(await page.evaluate(() => localStorage.getItem('strengthos:rest:workout-user-2')), '200')
  assert.equal(accountDeletes, 1, 'Startup cleanup must not repeat cloud account deletion')
  assert.deepEqual(qa.events.unexpected, [])
  assert.deepEqual(qa.events.errors, [])
  report.passed = true
} catch (error) {
  report.message = error.message
  await qa.capture('account-deletion-failure')
} finally {
  qa.events.checks.push(report)
  await qa.close('account-deletion-results')
  console.log(JSON.stringify(report))
}

if (!report.passed) process.exitCode = 1
