import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/returnTo.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
const { getSafeReturnTo, getSafeReturnToFromSearch, resolveReturnToFromSearch } = await import(moduleUrl)

const origin = 'https://strength-os-nu.vercel.app/login'

assert.equal(
  getSafeReturnTo('/oauth/consent?authorization_id=auth-123', origin),
  '/oauth/consent?authorization_id=auth-123',
)

assert.equal(
  getSafeReturnToFromSearch('?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123', origin),
  '/oauth/consent?authorization_id=auth-123',
)

assert.deepEqual(resolveReturnToFromSearch('?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123', origin), {
  rawSearch: '?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123',
  rawReturnTo: '%2Foauth%2Fconsent%3Fauthorization_id%3Dauth-123',
  parsedReturnTo: '/oauth/consent?authorization_id=auth-123',
  validatedReturnTo: '/oauth/consent?authorization_id=auth-123',
})

assert.equal(getSafeReturnToFromSearch('', origin), '/')
assert.equal(getSafeReturnTo('//evil.example/path', origin), '/')
assert.equal(getSafeReturnTo('https://evil.example/path', origin), '/')
assert.equal(getSafeReturnTo('/\\evil', origin), '/')
assert.equal(getSafeReturnTo('/profile', 'capacitor://localhost/login'), '/profile')
assert.equal(getSafeReturnTo('//evil.example/path', 'capacitor://localhost/login'), '/')
assert.equal(getSafeReturnTo('https://evil.example/path', 'capacitor://localhost/login'), '/')

console.log('returnTo tests passed')
