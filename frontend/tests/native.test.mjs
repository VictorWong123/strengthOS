import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { validateNativeEnvironment } from '../scripts/validate-native-env.mjs'

const accountStorageSource = await readFile(new URL('../src/lib/accountStorage.ts', import.meta.url), 'utf8')
const accountStorageModule = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(accountStorageSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`)
const accountFenceSource = await readFile(new URL('../src/lib/accountFence.ts', import.meta.url), 'utf8')
const accountFenceModule = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(accountFenceSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`)

const values = new Map([
  ['strengthos:routine-order:user-1', '["routine-1"]'],
  ['strengthos:routine-order:user-2', '["routine-2"]'],
  ['strengthos:rest:workout-1', '123'],
  ['strengthos:rest-overrides:workout-1', '{}'],
  ['strengthos:rest:workout-2', '456'],
])
const storage = {
  getItem: (key) => values.get(key) ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
}
accountStorageModule.clearAccountLocalStorage(storage, 'user-1', ['workout-1'])
assert.deepEqual([...values.keys()].sort(), ['strengthos:rest:workout-2', 'strengthos:routine-order:user-2'])
accountStorageModule.markPendingAccountCleanup(storage, 'user-1')
assert.equal(accountStorageModule.pendingAccountCleanup(storage), 'user-1')
accountStorageModule.finishPendingAccountCleanup(storage, 'user-2')
assert.equal(accountStorageModule.pendingAccountCleanup(storage), 'user-1')
accountStorageModule.finishPendingAccountCleanup(storage, 'user-1')
assert.equal(accountStorageModule.pendingAccountCleanup(storage), null)

accountFenceModule.setActiveAccount('user-1')
let releaseFirst
let releaseSecond
let currentQueue = new Promise((resolve) => { releaseFirst = resolve })
const fenced = accountFenceModule.fenceAccountMutations('user-1', () => [currentQueue])
assert.equal(accountFenceModule.accountIsActive('user-1'), false)
currentQueue = currentQueue.then(() => new Promise((resolve) => { releaseSecond = resolve }))
releaseFirst()
await new Promise((resolve) => setTimeout(resolve, 0))
let fenceFinished = false
void fenced.then(() => { fenceFinished = true })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(fenceFinished, false)
releaseSecond()
await fenced

accountFenceModule.setActiveAccount('user-1')
let releasePersist
let releaseNetwork
let persistenceStarted = false
const removedOperations = []
const blockedNetwork = new Promise((resolve) => { releaseNetwork = resolve })
const persisted = accountFenceModule.persistForActiveAccount(
  'user-1',
  'operation-1',
  () => new Promise((resolve) => { persistenceStarted = true; releasePersist = resolve }),
  async (operationId) => { removedOperations.push(operationId) },
)
assert.equal(persistenceStarted, true, 'local persistence must start while network mutation is blocked')
const deletionFence = accountFenceModule.fenceAccountMutations('user-1', () => [blockedNetwork, persisted])
releasePersist()
assert.equal(await persisted, false)
assert.deepEqual(removedOperations, ['operation-1'])
let deletionFinished = false
void deletionFence.then(() => { deletionFinished = true })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(deletionFinished, false)
releaseNetwork()
await deletionFence

const safeEnv = {
  VITE_API_URL: 'https://strengthos.onrender.com',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
  VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
}
assert.deepEqual(validateNativeEnvironment(safeEnv, "const config = { webDir: 'dist' }"), [])
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_ADMIN_API_KEY: 'secret' }, "const config = { webDir: 'dist' }").some((error) => error.includes('not allowed')))
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_API_URL: 'http://localhost:8000' }, "const config = { webDir: 'dist' }").some((error) => error.includes('public HTTPS')))
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }, "const config = { webDir: 'dist' }").some((error) => error.includes('publishable key')))
const userJwt = `header.${Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url')}.signature`
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_SUPABASE_PUBLISHABLE_KEY: userJwt }, "const config = { webDir: 'dist' }").some((error) => error.includes('publishable key')))
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_SUPABASE_PUBLISHABLE_KEY: 'opaque-secret' }, "const config = { webDir: 'dist' }").some((error) => error.includes('publishable key')))
const anonJwt = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
assert.deepEqual(validateNativeEnvironment({ ...safeEnv, VITE_SUPABASE_PUBLISHABLE_KEY: anonJwt }, "const config = { webDir: 'dist' }"), [])
assert.ok(validateNativeEnvironment(safeEnv, "const config = { server: { url: 'https://example.com' } } ").some((error) => error.includes('local assets')))
assert.ok(validateNativeEnvironment({ ...safeEnv, VITE_API_URL: 'https://api.example.com' }, "const config = { webDir: 'dist' }").some((error) => error.includes('placeholder host')))
assert.deepEqual(validateNativeEnvironment({
  VITE_API_URL: 'https://api.example.com',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
}, "const config = { webDir: 'dist' }", { ciFixture: true }), [])

console.log('native readiness tests passed')
